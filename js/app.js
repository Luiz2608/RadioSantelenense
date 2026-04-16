;(async function () {
  if ((window.Store?.mode || "local") !== "supabase") {
    window.MockData?.ensureSeeded?.()
  }

  const state = {
    currentUser: null,
    routes: [],
  }

  function isDirecao() {
    return state.currentUser?.role === "direcao"
  }

  function money(v) {
    const n = Number(v || 0)
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00")
    return d.toLocaleDateString("pt-BR")
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }

  function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0)
  }

  function within(iso, start, end) {
    const d = new Date(iso + "T00:00:00")
    return d >= start && d <= end
  }

  function sameDay(iso, ref) {
    const d = new Date(iso + "T00:00:00")
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()
  }

  function calcPeriodoTotal(startIso, endIso) {
    const start = new Date(startIso + "T00:00:00")
    const end = new Date(endIso + "T00:00:00")
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24))
    return diff + 1
  }

  function getVendorForUser(user) {
    if (!user) return null
    if (user.id) return Store.vendedores().find((v) => v.profileId && v.profileId === user.id) || null
    return Store.vendedores().find((v) => v.username === user.username) || null
  }

  function filterByRole(items, type) {
    const role = state.currentUser?.role
    if (role !== "vendedor") return items
    const vendor = getVendorForUser(state.currentUser)
    if (!vendor) return []

    if (type === "contratos") return items.filter((c) => Number(c.vendorId) === Number(vendor.id))
    if (type === "faturas") {
      const contratos = Store.contratos()
      const allowedContractIds = new Set(contratos.filter((c) => Number(c.vendorId) === Number(vendor.id)).map((c) => c.id))
      return items.filter((f) => allowedContractIds.has(f.contractId))
    }
    return items
  }

  function routeFromHash() {
    const raw = (window.location.hash || "#/").replace(/^#/, "")
    const path = raw.startsWith("/") ? raw : "/" + raw
    const match = state.routes.find((r) => r.path === path)
    return match || state.routes[0]
  }

  async function loadFragment(url) {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error("Falha ao carregar página")
    return await res.text()
  }

  function setPageMeta(route) {
    document.getElementById("pageTitle").textContent = route.title
    document.getElementById("pageSubtitle").textContent = route.subtitle
  }

  function renderNav() {
    const role = state.currentUser.role

    const items = [
      { path: "/", label: "Notificações", icon: "bell" },
      { path: "/clientes", label: "Clientes", icon: "building-2" },
      { path: "/vendedores", label: "Vendedores", icon: "users" },
      { path: "/contratos", label: "Contratos", icon: "file-text" },
      { path: "/faturas", label: "Faturas", icon: "receipt" },
      ...(role === "direcao"
        ? [
            { path: "/relatorios", label: "Relatórios", icon: "pie-chart" },
            { path: "/admin", label: "Admin", icon: "shield" },
          ]
        : []),
    ]

    const make = (containerId) => {
      const el = document.getElementById(containerId)
      el.innerHTML = items
        .map(
          (it) =>
            `<a class="nav-item-link" href="#${it.path}"><span data-lucide="${it.icon}" class="icon"></span>${it.label}</a>`
        )
        .join("")
    }

    make("sidebarNav")
    make("mobileSidebarNav")
  }

  function setActiveNav() {
    const currentPath = routeFromHash().path
    document.querySelectorAll(".nav-item-link").forEach((a) => {
      const href = a.getAttribute("href") || ""
      const path = href.replace(/^#/, "")
      a.classList.toggle("active", path === currentPath)
    })
  }

  async function ensureAuth() {
    if ((window.Store?.mode || "local") === "supabase") {
      await Store.init()
      const current = Store.currentUser?.() || null
      if (!current) {
        const url = window.location.href
        if (!url.endsWith("/login.html") && !url.includes("login.html")) {
          window.location.href = "./login.html"
        }
        return false
      }
      state.currentUser = current
      return true
    }

    const current = StoreAuth.getCurrent()
    if (!current) {
      const url = window.location.href
      if (!url.endsWith("/login.html") && !url.includes("login.html")) {
        window.location.href = "./login.html"
        return false
      }
    }
    state.currentUser = current || StoreAuth.ensureDemo()
    return true
  }

  async function navigate() {
    const route = routeFromHash()
    setPageMeta(route)
    setActiveNav()

    const root = document.getElementById("pageRoot")
    root.innerHTML = `<div class="card card-saas"><div class="card-body p-4 text-secondary">Carregando…</div></div>`

    try {
      const html = await loadFragment(route.fragment)
      root.innerHTML = html
      lucide.createIcons()
      route.onMount?.()
    } catch {
      root.innerHTML = `<div class="alert alert-danger">Não foi possível carregar esta página.</div>`
    }
  }

  function initTopbar() {
    document.getElementById("userName").textContent = state.currentUser.username
    document.getElementById("userRole").textContent = state.currentUser.role

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await Promise.resolve(StoreAuth.logout())
      window.location.href = "./login.html"
    })
  }

  function emptyList(message) {
    return `<div class="text-secondary small">${message}</div>`
  }

  function renderDashboard() {
    const today = new Date()
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const monthStart = startOfMonth(today)
    const monthEnd = endOfMonth(today)

    const contratos = filterByRole(Store.contratos(), "contratos")
    const clientes = Store.clientes()
    const vendedores = Store.vendedores()

    const byId = (list) => Object.fromEntries(list.map((x) => [Number(x.id), x]))
    const clientesById = byId(clientes)
    const vendedoresById = byId(vendedores)

    const hoje = contratos.filter((c) => sameDay(c.endDate, today))
    const semana = contratos.filter((c) => within(c.endDate, today, weekEnd))
    const mes = contratos.filter((c) => within(c.endDate, monthStart, monthEnd))

    const mapItem = (c) => {
      const cli = clientesById[Number(c.clientId)]
      const ven = vendedoresById[Number(c.vendorId)]
      return `<div class="d-flex align-items-center justify-content-between py-2 border-bottom">
        <div>
          <div class="fw-semibold">#${c.id} • ${cli?.nomeFantasia || "—"}</div>
          <div class="text-secondary small">Vendedor: ${ven?.nome || "—"}</div>
        </div>
        <div class="text-secondary small">${formatDate(c.endDate)}</div>
      </div>`
    }

    document.getElementById("dashHoje").innerHTML = hoje.length ? hoje.map(mapItem).join("") : emptyList("Nenhum contrato vencendo hoje")
    document.getElementById("dashSemana").innerHTML = semana.length ? semana.map(mapItem).join("") : emptyList("Nenhum contrato para a semana")
    document.getElementById("dashMes").innerHTML = mes.length ? mes.map(mapItem).join("") : emptyList("Nenhum contrato para o mês")

    const faturas = filterByRole(Store.faturas(), "faturas")
    const pendentes = faturas.filter((f) => f.status === "pendente")
    const pagas = faturas.filter((f) => f.status === "pago")
    document.getElementById("kpiPendentes").textContent = String(pendentes.length)
    document.getElementById("kpiPagas").textContent = String(pagas.length)
    document.getElementById("kpiValorPendente").textContent = money(pendentes.reduce((acc, f) => acc + Number(f.valor || 0), 0))
  }

  function renderClientes(filterText) {
    const showActions = isDirecao()
    document.getElementById("clientesAcoesTh")?.classList.toggle("d-none", !showActions)

    const tbody = document.getElementById("clientesTbody")
    const q = (filterText || "").toLowerCase()
    const items = Store.clientes().filter((c) => {
      const hay = `${c.nomeFantasia} ${c.razaoSocial} ${c.cnpj} ${c.cidade}`.toLowerCase()
      return hay.includes(q)
    })

    tbody.innerHTML = items
      .map(
        (c) => `<tr data-id="${c.id}">
          <td class="fw-semibold">${c.nomeFantasia || ""}</td>
          <td>${c.razaoSocial || ""}</td>
          <td><span class="badge text-bg-light border">${c.cnpj || ""}</span></td>
          <td>${c.telefone || ""}</td>
          <td>${c.cidade || ""}</td>
          ${
            showActions
              ? `<td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-id="${c.id}">
                    <span data-lucide="pencil" class="icon"></span>
                    Editar
                  </button>
                  <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${c.id}">
                    <span data-lucide="trash-2" class="icon"></span>
                    Excluir
                  </button>
                </td>`
              : ""
          }
        </tr>`
      )
      .join("")

    if (!items.length)
      tbody.innerHTML = `<tr><td colspan="${showActions ? 6 : 5}" class="text-secondary">Nenhum cliente encontrado.</td></tr>`
    lucide.createIcons()
  }

  function mountClientes() {
    const modalEl = document.getElementById("modalCliente")
    const modal = new bootstrap.Modal(modalEl)
    const form = document.getElementById("formCliente")
    const titleEl = document.getElementById("clienteModalTitle")
    const showActions = isDirecao()
    let editingId = null

    document.getElementById("btnNovoCliente").addEventListener("click", () => {
      document.getElementById("clienteErro").classList.add("d-none")
      editingId = null
      titleEl.textContent = "Novo Cliente"
      form.reset()
      modal.show()
    })

    document.getElementById("clientesBusca").addEventListener("input", (e) => renderClientes(e.target.value))

    document.getElementById("salvarCliente").addEventListener("click", async () => {
      if (!form.reportValidity()) return
      const fd = new FormData(form)
      try {
        const payload = Object.fromEntries(fd.entries())
        if (editingId && showActions) await Promise.resolve(Store.updateCliente(editingId, payload))
        else await Promise.resolve(Store.addCliente(payload))
        modal.hide()
        renderClientes(document.getElementById("clientesBusca").value)
      } catch {
        document.getElementById("clienteErro").classList.remove("d-none")
      }
    })

    document.getElementById("clientesTbody").addEventListener("click", async (e) => {
      if (!showActions) return
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      const action = btn.getAttribute("data-action")
      const id = Number(btn.getAttribute("data-id"))
      if (!id) return

      if (action === "edit") {
        const item = Store.clientes().find((c) => Number(c.id) === id)
        if (!item) return
        editingId = id
        titleEl.textContent = "Editar Cliente"
        form.reset()
        Object.keys(item).forEach((k) => {
          if (k === "id") return
          if (form.elements[k]) form.elements[k].value = item[k] ?? ""
        })
        modal.show()
      }

      if (action === "delete") {
        const hasContracts = Store.contratos().some((c) => Number(c.clientId) === id)
        if (hasContracts) {
          alert("Não é possível excluir: este cliente possui contratos vinculados.")
          return
        }
        const ok = confirm("Excluir este cliente? Esta ação não pode ser desfeita.")
        if (!ok) return
        await Promise.resolve(Store.deleteCliente(id))
        renderClientes(document.getElementById("clientesBusca").value)
      }
    })

    renderClientes("")
  }

  function renderVendedores() {
    const role = state.currentUser.role
    const canCreate = role === "secretaria" || role === "direcao"
    const showActions = isDirecao()
    document.getElementById("vendedoresAcoesTh")?.classList.toggle("d-none", !showActions)
    const btn = document.getElementById("btnNovoVendedor")
    btn.classList.toggle("d-none", !canCreate)

    const tbody = document.getElementById("vendedoresTbody")
    const usersById = Object.fromEntries(Store.users().map((u) => [u.id, u]))
    tbody.innerHTML = Store.vendedores()
      .map(
        (v) => `<tr data-id="${v.id}">
          <td class="fw-semibold">${v.nome}</td>
          <td><span class="badge text-bg-light border">${v.cpf}</span></td>
          <td>${
            v.profileId
              ? `<span class="badge text-bg-light border">${usersById[v.profileId]?.username || v.profileId}</span>`
              : v.username
                ? `<span class="badge text-bg-light border">${v.username}</span>`
                : `<span class="text-secondary">—</span>`
          }</td>
          ${
            showActions
              ? `<td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-id="${v.id}">
                    <span data-lucide="pencil" class="icon"></span>
                    Editar
                  </button>
                  <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${v.id}">
                    <span data-lucide="trash-2" class="icon"></span>
                    Excluir
                  </button>
                </td>`
              : ""
          }
        </tr>`
      )
      .join("")
    lucide.createIcons()
  }

  function mountVendedores() {
    const role = state.currentUser.role
    const showActions = isDirecao()
    const titleEl = document.getElementById("vendedorModalTitle")
    let editingId = null
    if (role !== "secretaria" && role !== "direcao") {
      document.getElementById("btnNovoVendedor").classList.add("d-none")
    }

    const modalEl = document.getElementById("modalVendedor")
    const modal = new bootstrap.Modal(modalEl)

    const select = document.getElementById("vendedorUserSelect")
    const users = Store.users()
    select.innerHTML = `<option value="">Nenhum</option>` + users.map((u) => `<option value="${u.id}">${u.username} (${u.role})</option>`).join("")

    document.getElementById("btnNovoVendedor").addEventListener("click", () => {
      if (role !== "secretaria" && role !== "direcao") return
      document.getElementById("vendedorErro").classList.add("d-none")
      editingId = null
      titleEl.textContent = "Novo Vendedor"
      document.getElementById("formVendedor").reset()
      modal.show()
    })

    document.getElementById("salvarVendedor").addEventListener("click", async () => {
      if (role !== "secretaria" && role !== "direcao") return
      const form = document.getElementById("formVendedor")
      if (!form.reportValidity()) return
      const fd = new FormData(form)
      try {
        const payload = Object.fromEntries(fd.entries())
        if (editingId && showActions) await Promise.resolve(Store.updateVendedor(editingId, payload))
        else await Promise.resolve(Store.addVendedor(payload))
        modal.hide()
        renderVendedores()
      } catch {
        document.getElementById("vendedorErro").classList.remove("d-none")
      }
    })

    document.getElementById("vendedoresTbody").addEventListener("click", async (e) => {
      if (!showActions) return
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      const action = btn.getAttribute("data-action")
      const id = Number(btn.getAttribute("data-id"))
      if (!id) return

      if (action === "edit") {
        const item = Store.vendedores().find((v) => Number(v.id) === id)
        if (!item) return
        editingId = id
        titleEl.textContent = "Editar Vendedor"
        const form = document.getElementById("formVendedor")
        form.reset()
        if (form.elements.nome) form.elements.nome.value = item.nome ?? ""
        if (form.elements.cpf) form.elements.cpf.value = item.cpf ?? ""
        if (form.elements.profileId) form.elements.profileId.value = item.profileId ?? item.username ?? ""
        modal.show()
      }

      if (action === "delete") {
        const hasContracts = Store.contratos().some((c) => Number(c.vendorId) === id)
        if (hasContracts) {
          alert("Não é possível excluir: este vendedor possui contratos vinculados.")
          return
        }
        const ok = confirm("Excluir este vendedor? Esta ação não pode ser desfeita.")
        if (!ok) return
        await Promise.resolve(Store.deleteVendedor(id))
        renderVendedores()
      }
    })

    renderVendedores()
  }

  function renderContratos() {
    const showActions = isDirecao()
    document.getElementById("contratosAcoesTh")?.classList.toggle("d-none", !showActions)
    const clientesById = Object.fromEntries(Store.clientes().map((c) => [Number(c.id), c]))
    const vendedoresById = Object.fromEntries(Store.vendedores().map((v) => [Number(v.id), v]))

    const items = filterByRole(Store.contratos(), "contratos").slice().sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
    const tbody = document.getElementById("contratosTbody")
    tbody.innerHTML = items
      .map((c) => {
        const cli = clientesById[Number(c.clientId)]
        const ven = vendedoresById[Number(c.vendorId)]
        return `<tr>
          <td><span class="badge text-bg-light border">#${c.id}</span></td>
          <td class="fw-semibold">${cli?.nomeFantasia || "—"}</td>
          <td>${ven?.nome || "—"}</td>
          <td>${formatDate(c.startDate)}</td>
          <td>${formatDate(c.endDate)}</td>
          <td><span class="badge text-bg-light border text-capitalize">${c.tipo}</span></td>
          <td>${c.periodoTotal} dias</td>
          ${
            showActions
              ? `<td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-id="${c.id}">
                    <span data-lucide="pencil" class="icon"></span>
                    Editar
                  </button>
                  <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${c.id}">
                    <span data-lucide="trash-2" class="icon"></span>
                    Excluir
                  </button>
                </td>`
              : ""
          }
        </tr>`
      })
      .join("")
    if (!items.length)
      tbody.innerHTML = `<tr><td colspan="${showActions ? 8 : 7}" class="text-secondary">Nenhum contrato encontrado.</td></tr>`
    lucide.createIcons()
  }

  function mountContratos() {
    const showActions = isDirecao()
    const titleEl = document.getElementById("contratoModalTitle")
    let editingId = null
    const modalEl = document.getElementById("modalContrato")
    const modal = new bootstrap.Modal(modalEl)

    const clienteSelect = document.getElementById("contratoClienteSelect")
    const vendedorSelect = document.getElementById("contratoVendedorSelect")

    const fillSelects = () => {
      const clientes = Store.clientes()
      clienteSelect.innerHTML = clientes.map((c) => `<option value="${c.id}">${c.nomeFantasia}</option>`).join("")

      let vendedores = Store.vendedores()
      if (state.currentUser.role === "vendedor") {
        const v = getVendorForUser(state.currentUser)
        vendedores = v ? [v] : []
      }
      vendedorSelect.innerHTML = vendedores.map((v) => `<option value="${v.id}">${v.nome}</option>`).join("")
    }

    fillSelects()

    const form = document.getElementById("formContrato")
    const periodoEl = document.getElementById("contratoPeriodoTotal")
    const computePeriodo = () => {
      const start = form.elements.startDate.value
      const end = form.elements.endDate.value
      if (!start || !end) {
        periodoEl.value = ""
        return
      }
      const total = window.MockData?.calcPeriodoTotal ? window.MockData.calcPeriodoTotal(start, end) : calcPeriodoTotal(start, end)
      periodoEl.value = String(total) + " dias"
    }
    form.elements.startDate.addEventListener("change", computePeriodo)
    form.elements.endDate.addEventListener("change", computePeriodo)

    document.getElementById("btnNovoContrato").addEventListener("click", () => {
      document.getElementById("contratoErro").classList.add("d-none")
      editingId = null
      titleEl.textContent = "Novo Contrato"
      form.reset()
      fillSelects()
      computePeriodo()
      modal.show()
    })

    document.getElementById("salvarContrato").addEventListener("click", async () => {
      if (!form.reportValidity()) return
      const fd = new FormData(form)
      const payload = Object.fromEntries(fd.entries())
      payload.clientId = Number(payload.clientId)
      payload.vendorId = Number(payload.vendorId)
      payload.insercoesPorDia = Number(payload.insercoesPorDia || 0)

      if (state.currentUser.role === "vendedor") {
        const v = getVendorForUser(state.currentUser)
        if (!v || Number(payload.vendorId) !== Number(v.id)) return
      }

      try {
        if (editingId && showActions) await Promise.resolve(Store.updateContrato(editingId, payload))
        else await Promise.resolve(Store.addContrato(payload))
        modal.hide()
        renderContratos()
      } catch {
        document.getElementById("contratoErro").classList.remove("d-none")
      }
    })

    document.getElementById("contratosTbody").addEventListener("click", async (e) => {
      if (!showActions) return
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      const action = btn.getAttribute("data-action")
      const id = Number(btn.getAttribute("data-id"))
      if (!id) return

      if (action === "edit") {
        const item = Store.contratos().find((c) => Number(c.id) === id)
        if (!item) return
        editingId = id
        titleEl.textContent = "Editar Contrato"
        form.reset()
        fillSelects()
        form.elements.clientId.value = String(item.clientId)
        form.elements.vendorId.value = String(item.vendorId)
        form.elements.startDate.value = item.startDate
        form.elements.endDate.value = item.endDate
        form.elements.insercoesPorDia.value = String(item.insercoesPorDia ?? 0)
        form.elements.horarios.value = item.horarios ?? ""
        form.elements.descricao.value = item.descricao ?? ""
        form.elements.tipo.value = item.tipo ?? "pos-pago"
        computePeriodo()
        modal.show()
      }

      if (action === "delete") {
        const ok = confirm("Excluir este contrato? As faturas vinculadas também serão removidas.")
        if (!ok) return
        await Promise.resolve(Store.deleteContrato(id))
        renderContratos()
      }
    })

    renderContratos()
  }

  function renderFaturas() {
    const showActions = isDirecao()
    document.getElementById("faturasAcoesTh")?.classList.toggle("d-none", !showActions)
    const contratosById = Object.fromEntries(Store.contratos().map((c) => [Number(c.id), c]))
    const clientesById = Object.fromEntries(Store.clientes().map((c) => [Number(c.id), c]))
    const vendedoresById = Object.fromEntries(Store.vendedores().map((v) => [Number(v.id), v]))

    const items = filterByRole(Store.faturas(), "faturas").slice().sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
    const tbody = document.getElementById("faturasTbody")
    tbody.innerHTML = items
      .map((f) => {
        const c = contratosById[Number(f.contractId)]
        const cli = c ? clientesById[Number(c.clientId)] : null
        const ven = c ? vendedoresById[Number(c.vendorId)] : null
        const badge = f.status === "pago" ? "text-bg-success" : "text-bg-warning"
        return `<tr>
          <td><span class="badge text-bg-light border">#${f.contractId}</span></td>
          <td class="fw-semibold">${cli?.nomeFantasia || "—"}</td>
          <td>${ven?.nome || "—"}</td>
          <td>${formatDate(f.dueDate)}</td>
          <td>${money(f.valor)}</td>
          <td><span class="badge ${badge} text-capitalize">${f.status}</span></td>
          <td><span class="badge text-bg-light border text-capitalize">${f.formaPagamento}</span></td>
          ${
            showActions
              ? `<td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-id="${f.id}">
                    <span data-lucide="pencil" class="icon"></span>
                    Editar
                  </button>
                  <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${f.id}">
                    <span data-lucide="trash-2" class="icon"></span>
                    Excluir
                  </button>
                </td>`
              : ""
          }
        </tr>`
      })
      .join("")
    if (!items.length)
      tbody.innerHTML = `<tr><td colspan="${showActions ? 8 : 7}" class="text-secondary">Nenhuma fatura encontrada.</td></tr>`
    lucide.createIcons()
  }

  function mountFaturas() {
    const showActions = isDirecao()
    const titleEl = document.getElementById("faturaModalTitle")
    let editingId = null
    const modalEl = document.getElementById("modalFatura")
    const modal = new bootstrap.Modal(modalEl)
    const select = document.getElementById("faturaContratoSelect")

    const fillContratos = () => {
      const contratos = filterByRole(Store.contratos(), "contratos")
      const clientesById = Object.fromEntries(Store.clientes().map((c) => [Number(c.id), c]))
      const vendedoresById = Object.fromEntries(Store.vendedores().map((v) => [Number(v.id), v]))
      select.innerHTML = contratos
        .map((c) => {
          const cli = clientesById[Number(c.clientId)]
          const ven = vendedoresById[Number(c.vendorId)]
          return `<option value="${c.id}">#${c.id} • ${cli?.nomeFantasia || "—"} • ${ven?.nome || "—"}</option>`
        })
        .join("")
    }

    fillContratos()

    const form = document.getElementById("formFatura")
    document.getElementById("btnNovaFatura").addEventListener("click", () => {
      document.getElementById("faturaErro").classList.add("d-none")
      editingId = null
      titleEl.textContent = "Nova Fatura"
      form.reset()
      fillContratos()
      modal.show()
    })

    document.getElementById("salvarFatura").addEventListener("click", async () => {
      if (!form.reportValidity()) return
      const fd = new FormData(form)
      const payload = Object.fromEntries(fd.entries())
      payload.contractId = Number(payload.contractId)
      payload.valor = Number(payload.valor)

      if (state.currentUser.role === "vendedor") {
        const v = getVendorForUser(state.currentUser)
        const c = Store.contratos().find((x) => Number(x.id) === Number(payload.contractId))
        if (!v || !c || Number(c.vendorId) !== Number(v.id)) return
      }

      try {
        if (editingId && showActions) await Promise.resolve(Store.updateFatura(editingId, payload))
        else await Promise.resolve(Store.addFatura(payload))
        modal.hide()
        renderFaturas()
      } catch {
        document.getElementById("faturaErro").classList.remove("d-none")
      }
    })

    document.getElementById("faturasTbody").addEventListener("click", async (e) => {
      if (!showActions) return
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      const action = btn.getAttribute("data-action")
      const id = Number(btn.getAttribute("data-id"))
      if (!id) return

      if (action === "edit") {
        const item = Store.faturas().find((f) => Number(f.id) === id)
        if (!item) return
        editingId = id
        titleEl.textContent = "Editar Fatura"
        form.reset()
        fillContratos()
        form.elements.contractId.value = String(item.contractId)
        form.elements.dueDate.value = item.dueDate
        form.elements.valor.value = String(item.valor ?? 0)
        form.elements.status.value = item.status ?? "pendente"
        form.elements.formaPagamento.value = item.formaPagamento ?? "pix"
        modal.show()
      }

      if (action === "delete") {
        const ok = confirm("Excluir esta fatura? Esta ação não pode ser desfeita.")
        if (!ok) return
        await Promise.resolve(Store.deleteFatura(id))
        renderFaturas()
      }
    })

    renderFaturas()
  }

  function mountAdmin() {
    if (!isDirecao()) {
      document.getElementById("pageRoot").innerHTML = `<div class="alert alert-warning">Acesso restrito à direção.</div>`
      return
    }

    const isSupabase = (window.Store?.mode || "local") === "supabase"
    const modalEl = document.getElementById("modalUser")
    const modal = new bootstrap.Modal(modalEl)
    const form = document.getElementById("formUser")
    const titleEl = document.getElementById("userModalTitle")
    const usernameEl = document.getElementById("userUsername")
    const passwordEl = document.getElementById("userPassword")
    const roleEl = document.getElementById("userRoleSelect")
    let editingUserId = null

    if (isSupabase && passwordEl?.parentElement) {
      passwordEl.parentElement.classList.add("d-none")
    }

    function renderUsers() {
      const tbody = document.getElementById("adminUsersTbody")
      const users = Store.users()
      tbody.innerHTML = users
        .map((u) => {
          const lock = isSupabase ? u.id === state.currentUser.id : u.username === "admin" || u.username === state.currentUser.username
          return `<tr>
            <td class="fw-semibold">${u.username}</td>
            <td><span class="badge text-bg-light border text-capitalize">${u.role}</span></td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-id="${u.id || ""}" data-username="${u.username}">
                <span data-lucide="pencil" class="icon"></span>
                Editar
              </button>
              <button class="btn btn-sm btn-outline-danger ${lock || isSupabase ? "disabled" : ""}" data-action="delete" data-id="${u.id || ""}" data-username="${u.username}">
                <span data-lucide="trash-2" class="icon"></span>
                Excluir
              </button>
            </td>
          </tr>`
        })
        .join("")
      lucide.createIcons()
    }

    document.getElementById("btnNovoUsuario").addEventListener("click", () => {
      if (isSupabase) {
        alert("Para criar usuários, use o painel do Supabase (Authentication). Aqui você gerencia perfil e permissões.")
        return
      }
      editingUserId = null
      titleEl.textContent = "Novo Usuário"
      form.reset()
      usernameEl.disabled = false
      passwordEl.placeholder = "Defina a senha"
      modal.show()
    })

    document.getElementById("salvarUser").addEventListener("click", async () => {
      if (!form.reportValidity()) return
      const username = usernameEl.value.trim()
      const password = passwordEl.value
      const role = roleEl.value

      try {
        if (isSupabase) {
          if (!editingUserId) return
          const patch = { role, username }
          await Promise.resolve(Store.updateUser(editingUserId, patch))
          if (editingUserId === state.currentUser.id) window.location.reload()
        } else {
          if (!editingUserId) {
            if (!password) return
            Store.addUser({ username, password, role })
          } else {
            const patch = { role }
            if (password) patch.password = password
            Store.updateUser(editingUserId, patch)
            if (editingUserId === state.currentUser.username) {
              state.currentUser.role = role
              StoreAuth.setCurrent({ username: state.currentUser.username, role })
              window.location.reload()
              return
            }
          }
        }
        modal.hide()
        renderUsers()
      } catch {
        alert("Não foi possível salvar. Verifique se o usuário já existe.")
      }
    })

    document.getElementById("adminUsersTbody").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]")
      if (!btn) return
      const action = btn.getAttribute("data-action")
      const username = btn.getAttribute("data-username")
      const id = btn.getAttribute("data-id") || ""
      if (!username) return

      if (action === "edit") {
        const u = Store.users().find((x) => (isSupabase ? x.id === id : x.username === username))
        if (!u) return
        editingUserId = isSupabase ? u.id : u.username
        titleEl.textContent = "Editar Usuário"
        form.reset()
        usernameEl.value = u.username
        usernameEl.disabled = !isSupabase
        roleEl.value = u.role
        passwordEl.value = ""
        passwordEl.placeholder = "Deixe em branco para manter"
        modal.show()
      }

      if (action === "delete") {
        if (isSupabase) return
        if (username === "admin" || username === state.currentUser.username) return
        const ok = confirm(`Excluir o usuário "${username}"?`)
        if (!ok) return
        Store.deleteUser(username)
        renderUsers()
      }
    })

    renderUsers()
  }

  function mountRelatorios() {
    if (state.currentUser.role !== "direcao") {
      document.getElementById("pageRoot").innerHTML = `<div class="alert alert-warning">Acesso restrito à direção.</div>`
      return
    }

    const today = new Date()
    const start = startOfMonth(today)
    const end = endOfMonth(today)
    const inicioEl = document.getElementById("relInicio")
    const fimEl = document.getElementById("relFim")
    inicioEl.value = start.toISOString().slice(0, 10)
    fimEl.value = end.toISOString().slice(0, 10)

    const apply = () => {
      const inicio = new Date(inicioEl.value + "T00:00:00")
      const fim = new Date(fimEl.value + "T23:59:59")
      const faturas = Store.faturas().filter((f) => within(f.dueDate, inicio, fim))
      const contratosById = Object.fromEntries(Store.contratos().map((c) => [Number(c.id), c]))
      const vendedoresById = Object.fromEntries(Store.vendedores().map((v) => [Number(v.id), v]))

      const total = faturas.reduce((acc, f) => acc + Number(f.valor || 0), 0)
      document.getElementById("relTotal").textContent = money(total)

      const por = {}
      for (const f of faturas) {
        const c = contratosById[Number(f.contractId)]
        const ven = c ? vendedoresById[Number(c.vendorId)] : null
        const key = ven?.nome || "—"
        por[key] = (por[key] || 0) + Number(f.valor || 0)
      }

      const rows = Object.entries(por)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, val]) => `<tr><td class="fw-semibold">${nome}</td><td>${money(val)}</td></tr>`)
        .join("")

      const tbody = document.getElementById("relPorVendedor")
      tbody.innerHTML = rows
      document.getElementById("relEmpty").textContent = rows ? "" : "Sem dados no período."

      document.getElementById("btnExportarCsv").onclick = () => exportCsv(faturas, contratosById, vendedoresById)
    }

    function exportCsv(faturas, contratosById, vendedoresById) {
      const clientesById = Object.fromEntries(Store.clientes().map((c) => [Number(c.id), c]))
      const header = ["Contrato", "Vendedor", "Cliente", "Vencimento", "Valor", "Status", "Forma de Pagamento"]
      const lines = [header.join(",")]
      for (const f of faturas) {
        const c = contratosById[Number(f.contractId)]
        const ven = c ? vendedoresById[Number(c.vendorId)] : null
        const cli = c ? clientesById[Number(c.clientId)] : null
        const row = [
          f.contractId,
          `"${(ven?.nome || "").replaceAll('"', '""')}"`,
          `"${(cli?.nomeFantasia || "").replaceAll('"', '""')}"`,
          f.dueDate,
          String(f.valor),
          f.status,
          f.formaPagamento,
        ]
        lines.push(row.join(","))
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = "relatorio.csv"
      document.body.appendChild(a)
      a.click()
      a.remove()
    }

    document.getElementById("btnAplicarRel").addEventListener("click", apply)
    apply()
  }

  function initRoutes() {
    state.routes = [
      { path: "/", title: "Dashboard", subtitle: "Notificações e visão geral", fragment: "./pages/dashboard.html", onMount: renderDashboard },
      { path: "/clientes", title: "Clientes", subtitle: "Cadastro e consulta", fragment: "./pages/clientes.html", onMount: mountClientes },
      { path: "/vendedores", title: "Vendedores", subtitle: "Cadastro e vinculação", fragment: "./pages/vendedores.html", onMount: mountVendedores },
      { path: "/contratos", title: "Contratos", subtitle: "Cadastro e acompanhamento", fragment: "./pages/contratos.html", onMount: mountContratos },
      { path: "/faturas", title: "Faturas", subtitle: "Vencimentos e pagamentos", fragment: "./pages/faturas.html", onMount: mountFaturas },
      { path: "/relatorios", title: "Relatórios", subtitle: "Financeiro e exportação", fragment: "./pages/relatorios.html", onMount: mountRelatorios },
      { path: "/admin", title: "Admin", subtitle: "Usuários e permissões", fragment: "./pages/admin.html", onMount: mountAdmin },
    ]
  }

  async function boot() {
    if (!(await ensureAuth())) return
    initRoutes()
    renderNav()
    initTopbar()
    lucide.createIcons()
    window.addEventListener("hashchange", navigate)
    navigate()
  }

  boot()
})()
