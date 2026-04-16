;(function () {
  const SEED_FLAG = "rs.seed.v1"

  const users = [
    { username: "admin", password: "admin", role: "direcao" },
    { username: "secretaria", password: "secretaria", role: "secretaria" },
    { username: "vendedor", password: "vendedor", role: "vendedor" },
  ]

  function iso(d) {
    return d.toISOString().slice(0, 10)
  }

  function addDays(base, days) {
    const d = new Date(base)
    d.setDate(d.getDate() + days)
    return d
  }

  function ensureSeeded() {
    if (localStorage.getItem(SEED_FLAG) === "1") return

    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const clientes = [
      { id: 1, razaoSocial: "Comércio Santa Luzia LTDA", nomeFantasia: "Santa Luzia", cnpj: "12.345.678/0001-00", inscricaoEstadual: "ISENTO", telefone: "(88) 99999-0000", celular: "(88) 98888-0000", enderecoLinha: "Rua Central, 100", bairro: "Centro", cidade: "Santa Helena", cep: "00000-000" },
      { id: 2, razaoSocial: "Auto Peças Sertão ME", nomeFantasia: "Auto Peças Sertão", cnpj: "98.765.432/0001-00", inscricaoEstadual: "123456", telefone: "(88) 3222-0000", celular: "(88) 97777-0000", enderecoLinha: "Av. Principal, 450", bairro: "Centro", cidade: "Santa Helena", cep: "00000-000" },
    ]

    const vendedores = [
      { id: 1, nome: "Vendedor Demo", cpf: "000.000.000-00", username: "vendedor" },
      { id: 2, nome: "Vendedor 2", cpf: "111.111.111-11", username: "" },
    ]

    const contratos = [
      { id: 1, clientId: 1, vendorId: 1, startDate: iso(addDays(monthStart, 3)), endDate: iso(addDays(today, 0)), descricao: "Pacote mensal - spots", insercoesPorDia: 4, horarios: "07:30, 12:00, 18:45", tipo: "pos-pago" },
      { id: 2, clientId: 2, vendorId: 1, startDate: iso(addDays(monthStart, 10)), endDate: iso(addDays(today, 5)), descricao: "Campanha semanal", insercoesPorDia: 3, horarios: "08:00, 13:00, 19:00", tipo: "pre-pago" },
      { id: 3, clientId: 2, vendorId: 2, startDate: iso(addDays(monthStart, 1)), endDate: iso(addDays(today, 18)), descricao: "Permuta - divulgação", insercoesPorDia: 2, horarios: "09:00, 16:00", tipo: "permuta" },
    ].map((c) => ({ ...c, periodoTotal: calcPeriodoTotal(c.startDate, c.endDate) }))

    const faturas = [
      { id: 1, contractId: 1, dueDate: iso(addDays(today, 2)), valor: 450.0, status: "pendente", formaPagamento: "pix" },
      { id: 2, contractId: 2, dueDate: iso(addDays(today, -4)), valor: 300.0, status: "pago", formaPagamento: "dinheiro" },
      { id: 3, contractId: 3, dueDate: iso(addDays(today, 10)), valor: 600.0, status: "pendente", formaPagamento: "boleto" },
    ]

    localStorage.setItem("rs.users", JSON.stringify(users))
    localStorage.setItem("rs.clientes", JSON.stringify(clientes))
    localStorage.setItem("rs.vendedores", JSON.stringify(vendedores))
    localStorage.setItem("rs.contratos", JSON.stringify(contratos))
    localStorage.setItem("rs.faturas", JSON.stringify(faturas))
    localStorage.setItem(SEED_FLAG, "1")
  }

  function calcPeriodoTotal(startIso, endIso) {
    const start = new Date(startIso + "T00:00:00")
    const end = new Date(endIso + "T00:00:00")
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24))
    return diff + 1
  }

  window.MockData = { ensureSeeded, calcPeriodoTotal }
})()
