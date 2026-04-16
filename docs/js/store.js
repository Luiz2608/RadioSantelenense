;(function () {
  const SUPABASE_URL = window.RS_SUPABASE_URL || ""
  const SUPABASE_ANON_KEY_FROM_WINDOW = window.RS_SUPABASE_ANON_KEY || ""
  const SUPABASE_ANON_KEY_FROM_STORAGE = localStorage.getItem("rs.supabase.anonKey") || ""
  let SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_FROM_WINDOW || SUPABASE_ANON_KEY_FROM_STORAGE
  if (SUPABASE_URL && !SUPABASE_ANON_KEY) {
    const key = (window.prompt("Cole a Supabase anon key para ativar o banco de dados:") || "").trim()
    if (key) {
      SUPABASE_ANON_KEY = key
      localStorage.setItem("rs.supabase.anonKey", SUPABASE_ANON_KEY)
    }
  }
  const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient)

  const KEYS = {
    users: "rs.users",
    clientes: "rs.clientes",
    vendedores: "rs.vendedores",
    contratos: "rs.contratos",
    faturas: "rs.faturas",
    auth: "rs.auth",
  }

  function read(key, fallback) {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }

  function nextId(items) {
    const max = items.reduce((acc, it) => Math.max(acc, Number(it.id) || 0), 0)
    return max + 1
  }

  function upsertById(items, id, patch) {
    const idx = items.findIndex((x) => Number(x.id) === Number(id))
    if (idx === -1) return null
    const updated = { ...items[idx], ...patch, id: items[idx].id }
    items[idx] = updated
    return updated
  }

  function removeById(items, id) {
    const idx = items.findIndex((x) => Number(x.id) === Number(id))
    if (idx === -1) return false
    items.splice(idx, 1)
    return true
  }

  function calcPeriodoTotal(startIso, endIso) {
    if (window.MockData?.calcPeriodoTotal) return window.MockData.calcPeriodoTotal(startIso, endIso)
    const start = new Date(startIso + "T00:00:00")
    const end = new Date(endIso + "T00:00:00")
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24))
    return diff + 1
  }

  function mapClienteFromDb(row) {
    return {
      id: Number(row.id),
      razaoSocial: row.razao_social ?? "",
      nomeFantasia: row.nome_fantasia ?? "",
      cnpj: row.cnpj ?? "",
      inscricaoEstadual: row.inscricao_estadual ?? "",
      telefone: row.telefone ?? "",
      celular: row.celular ?? "",
      enderecoLinha: row.endereco_linha ?? "",
      bairro: row.bairro ?? "",
      cidade: row.cidade ?? "",
      cep: row.cep ?? "",
    }
  }

  function mapClienteToDb(payload) {
    return {
      razao_social: payload.razaoSocial || null,
      nome_fantasia: payload.nomeFantasia || null,
      cnpj: payload.cnpj || null,
      inscricao_estadual: payload.inscricaoEstadual || null,
      telefone: payload.telefone || null,
      celular: payload.celular || null,
      endereco_linha: payload.enderecoLinha || null,
      bairro: payload.bairro || null,
      cidade: payload.cidade || null,
      cep: payload.cep || null,
    }
  }

  function mapVendedorFromDb(row) {
    return {
      id: Number(row.id),
      nome: row.nome ?? "",
      cpf: row.cpf ?? "",
      profileId: row.profile_id ?? "",
      username: row.username ?? "",
    }
  }

  function mapVendedorToDb(payload) {
    return {
      nome: payload.nome || null,
      cpf: payload.cpf || null,
      profile_id: payload.profileId || null,
      username: payload.username || null,
    }
  }

  function mapContratoFromDb(row) {
    return {
      id: Number(row.id),
      clientId: Number(row.client_id),
      vendorId: Number(row.vendor_id),
      startDate: row.start_date,
      endDate: row.end_date,
      descricao: row.descricao ?? "",
      insercoesPorDia: Number(row.insercoes_por_dia ?? 0),
      horarios: row.horarios ?? "",
      tipo: row.tipo ?? "pos-pago",
      periodoTotal: Number(row.periodo_total ?? calcPeriodoTotal(row.start_date, row.end_date)),
    }
  }

  function mapContratoToDb(payload) {
    return {
      client_id: payload.clientId,
      vendor_id: payload.vendorId,
      start_date: payload.startDate,
      end_date: payload.endDate,
      descricao: payload.descricao || null,
      insercoes_por_dia: Number(payload.insercoesPorDia || 0),
      horarios: payload.horarios || null,
      tipo: payload.tipo || "pos-pago",
    }
  }

  function mapFaturaFromDb(row) {
    return {
      id: Number(row.id),
      contractId: Number(row.contract_id),
      dueDate: row.due_date,
      valor: Number(row.valor ?? 0),
      status: row.status ?? "pendente",
      formaPagamento: row.forma_pagamento ?? "pix",
    }
  }

  function mapFaturaToDb(payload) {
    return {
      contract_id: payload.contractId,
      due_date: payload.dueDate,
      valor: Number(payload.valor || 0),
      status: payload.status || "pendente",
      forma_pagamento: payload.formaPagamento || "pix",
    }
  }

  const supabaseClient = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

  const StoreAuthLocal = {
    getCurrent() {
      return read(KEYS.auth, null)
    },
    setCurrent(user) {
      write(KEYS.auth, user)
    },
    logout() {
      localStorage.removeItem(KEYS.auth)
    },
    login(username, password) {
      const users = read(KEYS.users, [])
      const found = users.find((u) => u.username === username && u.password === password)
      if (!found) return false
      StoreAuthLocal.setCurrent({ username: found.username, role: found.role })
      return true
    },
    ensureDemo() {
      const current = StoreAuthLocal.getCurrent()
      if (current) return current
      const demo = { username: "admin", role: "direcao" }
      StoreAuthLocal.setCurrent(demo)
      return demo
    },
  }

  const StoreAuthSupabase = {
    async getSession() {
      const res = await supabaseClient.auth.getSession()
      return res.data.session || null
    },
    async getCurrent() {
      const session = await StoreAuthSupabase.getSession()
      if (!session?.user) return null
      const user = session.user
      const { data } = await supabaseClient.from("profiles").select("id, username, role").eq("id", user.id).maybeSingle()
      return {
        id: user.id,
        email: user.email || "",
        username: data?.username || user.email || "",
        role: data?.role || "vendedor",
      }
    },
    async login(email, password) {
      const res = await supabaseClient.auth.signInWithPassword({ email, password })
      if (res.error) return { ok: false, error: res.error }
      return { ok: true, error: null }
    },
    async signup(email, password, username) {
      const options = username ? { data: { username } } : {}
      const res = await supabaseClient.auth.signUp({ email, password, options })
      if (res.error) return { ok: false, error: res.error, needsConfirmation: false }
      const needsConfirmation = !res.data?.session
      return { ok: true, error: null, needsConfirmation }
    },
    async logout() {
      await supabaseClient.auth.signOut()
    },
  }

  const StoreLocal = {
    users() {
      return read(KEYS.users, []).map((u) => ({ ...u, id: u.id || u.username }))
    },
    clientes() {
      return read(KEYS.clientes, [])
    },
    vendedores() {
      return read(KEYS.vendedores, [])
    },
    contratos() {
      return read(KEYS.contratos, [])
    },
    faturas() {
      return read(KEYS.faturas, [])
    },
    addCliente(payload) {
      const items = StoreLocal.clientes()
      const item = { id: nextId(items), ...payload }
      items.push(item)
      write(KEYS.clientes, items)
      return item
    },
    updateCliente(id, patch) {
      const items = StoreLocal.clientes()
      const updated = upsertById(items, id, patch)
      if (!updated) return null
      write(KEYS.clientes, items)
      return updated
    },
    deleteCliente(id) {
      const items = StoreLocal.clientes()
      const ok = removeById(items, id)
      if (!ok) return false
      write(KEYS.clientes, items)
      return true
    },
    addVendedor(payload) {
      const items = StoreLocal.vendedores()
      const normalized = { ...payload }
      if (!normalized.username && normalized.profileId) normalized.username = normalized.profileId
      const item = { id: nextId(items), ...normalized }
      items.push(item)
      write(KEYS.vendedores, items)
      return item
    },
    updateVendedor(id, patch) {
      const items = StoreLocal.vendedores()
      const normalized = { ...patch }
      if (!normalized.username && normalized.profileId) normalized.username = normalized.profileId
      const updated = upsertById(items, id, normalized)
      if (!updated) return null
      write(KEYS.vendedores, items)
      return updated
    },
    deleteVendedor(id) {
      const items = StoreLocal.vendedores()
      const ok = removeById(items, id)
      if (!ok) return false
      write(KEYS.vendedores, items)
      return true
    },
    addContrato(payload) {
      const items = StoreLocal.contratos()
      const periodoTotal = calcPeriodoTotal(payload.startDate, payload.endDate)
      const item = { id: nextId(items), ...payload, periodoTotal }
      items.push(item)
      write(KEYS.contratos, items)
      return item
    },
    updateContrato(id, patch) {
      const items = StoreLocal.contratos()
      const payload = { ...patch }
      if (payload.startDate && payload.endDate) {
        payload.periodoTotal = calcPeriodoTotal(payload.startDate, payload.endDate)
      }
      const updated = upsertById(items, id, payload)
      if (!updated) return null
      write(KEYS.contratos, items)
      return updated
    },
    deleteContrato(id) {
      const contratos = StoreLocal.contratos()
      const ok = removeById(contratos, id)
      if (!ok) return false
      write(KEYS.contratos, contratos)
      const faturas = StoreLocal.faturas().filter((f) => Number(f.contractId) !== Number(id))
      write(KEYS.faturas, faturas)
      return true
    },
    addFatura(payload) {
      const items = StoreLocal.faturas()
      const item = { id: nextId(items), ...payload }
      items.push(item)
      write(KEYS.faturas, items)
      return item
    },
    updateFatura(id, patch) {
      const items = StoreLocal.faturas()
      const updated = upsertById(items, id, patch)
      if (!updated) return null
      write(KEYS.faturas, items)
      return updated
    },
    deleteFatura(id) {
      const items = StoreLocal.faturas()
      const ok = removeById(items, id)
      if (!ok) return false
      write(KEYS.faturas, items)
      return true
    },
    addUser(payload) {
      const items = StoreLocal.users()
      const exists = items.some((u) => u.username === payload.username)
      if (exists) throw new Error("username-exists")
      items.push(payload)
      write(KEYS.users, items)
      return payload
    },
    updateUser(username, patch) {
      const items = StoreLocal.users()
      const idx = items.findIndex((u) => u.username === username)
      if (idx === -1) return null
      items[idx] = { ...items[idx], ...patch, username: items[idx].username }
      write(KEYS.users, items)
      return items[idx]
    },
    deleteUser(username) {
      const items = StoreLocal.users()
      const idx = items.findIndex((u) => u.username === username)
      if (idx === -1) return false
      items.splice(idx, 1)
      write(KEYS.users, items)
      return true
    },
  }

  const StoreSupabase = {
    _cache: {
      profiles: [],
      clientes: [],
      vendedores: [],
      contratos: [],
      faturas: [],
    },
    _currentUser: null,
    lastError: null,
    mode: "supabase",
    auth: StoreAuthSupabase,
    currentUser() {
      return StoreSupabase._currentUser
    },
    async init() {
      try {
        StoreSupabase.lastError = null
        StoreSupabase._currentUser = await StoreAuthSupabase.getCurrent()
        if (!StoreSupabase._currentUser) return
        await StoreSupabase.refreshAll()
      } catch (e) {
        StoreSupabase.lastError = e
        throw e
      }
    },
    async refreshAll() {
      const clientesRes = await supabaseClient.from("clientes").select("*").order("id", { ascending: true })
      if (clientesRes.error) throw clientesRes.error
      StoreSupabase._cache.clientes = (clientesRes.data || []).map(mapClienteFromDb)

      const vendedoresRes = await supabaseClient.from("vendedores").select("*").order("id", { ascending: true })
      if (vendedoresRes.error) throw vendedoresRes.error
      StoreSupabase._cache.vendedores = (vendedoresRes.data || []).map(mapVendedorFromDb)

      const contratosRes = await supabaseClient.from("contratos").select("*").order("id", { ascending: true })
      if (contratosRes.error) throw contratosRes.error
      StoreSupabase._cache.contratos = (contratosRes.data || []).map(mapContratoFromDb)

      const faturasRes = await supabaseClient.from("faturas").select("*").order("id", { ascending: true })
      if (faturasRes.error) throw faturasRes.error
      StoreSupabase._cache.faturas = (faturasRes.data || []).map(mapFaturaFromDb)

      const profilesRes = await supabaseClient.from("profiles").select("id, username, role").order("username", { ascending: true })
      if (!profilesRes.error) StoreSupabase._cache.profiles = profilesRes.data || []
    },
    users() {
      return StoreSupabase._cache.profiles.map((p) => ({ id: p.id, username: p.username, role: p.role }))
    },
    profiles() {
      return StoreSupabase._cache.profiles.slice()
    },
    clientes() {
      return StoreSupabase._cache.clientes.slice()
    },
    vendedores() {
      return StoreSupabase._cache.vendedores.slice()
    },
    contratos() {
      return StoreSupabase._cache.contratos.slice()
    },
    faturas() {
      return StoreSupabase._cache.faturas.slice()
    },
    async addCliente(payload) {
      const res = await supabaseClient.from("clientes").insert(mapClienteToDb(payload)).select("*").single()
      if (res.error) throw res.error
      const item = mapClienteFromDb(res.data)
      StoreSupabase._cache.clientes.push(item)
      return item
    },
    async updateCliente(id, patch) {
      const res = await supabaseClient.from("clientes").update(mapClienteToDb(patch)).eq("id", id).select("*").single()
      if (res.error) throw res.error
      const updated = mapClienteFromDb(res.data)
      const idx = StoreSupabase._cache.clientes.findIndex((x) => Number(x.id) === Number(id))
      if (idx !== -1) StoreSupabase._cache.clientes[idx] = updated
      return updated
    },
    async deleteCliente(id) {
      const res = await supabaseClient.from("clientes").delete().eq("id", id)
      if (res.error) throw res.error
      StoreSupabase._cache.clientes = StoreSupabase._cache.clientes.filter((c) => Number(c.id) !== Number(id))
      return true
    },
    async addVendedor(payload) {
      const res = await supabaseClient.from("vendedores").insert(mapVendedorToDb(payload)).select("*").single()
      if (res.error) throw res.error
      const item = mapVendedorFromDb(res.data)
      StoreSupabase._cache.vendedores.push(item)
      return item
    },
    async updateVendedor(id, patch) {
      const res = await supabaseClient.from("vendedores").update(mapVendedorToDb(patch)).eq("id", id).select("*").single()
      if (res.error) throw res.error
      const updated = mapVendedorFromDb(res.data)
      const idx = StoreSupabase._cache.vendedores.findIndex((x) => Number(x.id) === Number(id))
      if (idx !== -1) StoreSupabase._cache.vendedores[idx] = updated
      return updated
    },
    async deleteVendedor(id) {
      const res = await supabaseClient.from("vendedores").delete().eq("id", id)
      if (res.error) throw res.error
      StoreSupabase._cache.vendedores = StoreSupabase._cache.vendedores.filter((v) => Number(v.id) !== Number(id))
      return true
    },
    async addContrato(payload) {
      const res = await supabaseClient.from("contratos").insert(mapContratoToDb(payload)).select("*").single()
      if (res.error) throw res.error
      const item = mapContratoFromDb(res.data)
      StoreSupabase._cache.contratos.push(item)
      return item
    },
    async updateContrato(id, patch) {
      const res = await supabaseClient.from("contratos").update(mapContratoToDb(patch)).eq("id", id).select("*").single()
      if (res.error) throw res.error
      const updated = mapContratoFromDb(res.data)
      const idx = StoreSupabase._cache.contratos.findIndex((x) => Number(x.id) === Number(id))
      if (idx !== -1) StoreSupabase._cache.contratos[idx] = updated
      return updated
    },
    async deleteContrato(id) {
      const delFaturas = await supabaseClient.from("faturas").delete().eq("contract_id", id)
      if (delFaturas.error) throw delFaturas.error
      const delContrato = await supabaseClient.from("contratos").delete().eq("id", id)
      if (delContrato.error) throw delContrato.error
      StoreSupabase._cache.contratos = StoreSupabase._cache.contratos.filter((c) => Number(c.id) !== Number(id))
      StoreSupabase._cache.faturas = StoreSupabase._cache.faturas.filter((f) => Number(f.contractId) !== Number(id))
      return true
    },
    async addFatura(payload) {
      const res = await supabaseClient.from("faturas").insert(mapFaturaToDb(payload)).select("*").single()
      if (res.error) throw res.error
      const item = mapFaturaFromDb(res.data)
      StoreSupabase._cache.faturas.push(item)
      return item
    },
    async updateFatura(id, patch) {
      const res = await supabaseClient.from("faturas").update(mapFaturaToDb(patch)).eq("id", id).select("*").single()
      if (res.error) throw res.error
      const updated = mapFaturaFromDb(res.data)
      const idx = StoreSupabase._cache.faturas.findIndex((x) => Number(x.id) === Number(id))
      if (idx !== -1) StoreSupabase._cache.faturas[idx] = updated
      return updated
    },
    async deleteFatura(id) {
      const res = await supabaseClient.from("faturas").delete().eq("id", id)
      if (res.error) throw res.error
      StoreSupabase._cache.faturas = StoreSupabase._cache.faturas.filter((f) => Number(f.id) !== Number(id))
      return true
    },
    async updateUser(userId, patch) {
      const res = await supabaseClient.from("profiles").update(patch).eq("id", userId).select("id, username, role").single()
      if (res.error) throw res.error
      const idx = StoreSupabase._cache.profiles.findIndex((p) => p.id === userId)
      if (idx !== -1) StoreSupabase._cache.profiles[idx] = res.data
      return { id: res.data.id, username: res.data.username, role: res.data.role }
    },
    async deleteUser() {
      throw new Error("not-supported")
    },
    async addUser() {
      throw new Error("not-supported")
    },
  }

  const Store = hasSupabase ? StoreSupabase : { ...StoreLocal, mode: "local", auth: StoreAuthLocal, currentUser: () => null, init: async () => {} }
  const StoreAuth = hasSupabase ? StoreAuthSupabase : StoreAuthLocal

  window.Store = Store
  window.StoreAuth = StoreAuth
  window.SupabaseClient = supabaseClient
})()
