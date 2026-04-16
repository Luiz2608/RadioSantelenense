import os
from datetime import datetime, date, timedelta
from flask import Flask, render_template, request, redirect, url_for, session, g, send_file
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import csv
from io import StringIO

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")
db_path = os.path.join(os.path.dirname(__file__), "database.sqlite")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)

class Vendor(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    cpf = db.Column(db.String(20), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user = db.relationship("User", backref="vendor", uselist=False)

class Client(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    razao_social = db.Column(db.String(200), nullable=False)
    nome_fantasia = db.Column(db.String(200), nullable=False)
    cnpj = db.Column(db.String(30), nullable=False)
    inscricao_estadual = db.Column(db.String(30), nullable=True)
    telefone = db.Column(db.String(30), nullable=True)
    celular = db.Column(db.String(30), nullable=True)
    rua = db.Column(db.String(200), nullable=True)
    numero = db.Column(db.String(20), nullable=True)
    complemento = db.Column(db.String(200), nullable=True)
    bairro = db.Column(db.String(200), nullable=True)
    cidade = db.Column(db.String(200), nullable=True)
    cep = db.Column(db.String(20), nullable=True)

class Contract(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False)
    client = db.relationship("Client", backref="contracts")
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    descricao = db.Column(db.Text, nullable=True)
    insercoes_por_dia = db.Column(db.Integer, nullable=False, default=0)
    horarios = db.Column(db.String(200), nullable=True)
    periodo_total = db.Column(db.Integer, nullable=False, default=0)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendor.id"), nullable=False)
    vendor = db.relationship("Vendor", backref="contracts")
    tipo = db.Column(db.String(20), nullable=False)

class Invoice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    contract_id = db.Column(db.Integer, db.ForeignKey("contract.id"), nullable=False)
    contract = db.relationship("Contract", backref="invoices")
    due_date = db.Column(db.Date, nullable=False)
    valor = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False)
    forma_pagamento = db.Column(db.String(20), nullable=False)

def role_required(*roles):
    def wrapper(func):
        def inner(*args, **kwargs):
            if not g.user:
                return redirect(url_for("login"))
            if g.user.role not in roles:
                return redirect(url_for("index"))
            return func(*args, **kwargs)
        inner.__name__ = func.__name__
        return inner
    return wrapper

@app.before_request
def load_user():
    uid = session.get("user_id")
    g.user = User.query.get(uid) if uid else None

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            session["user_id"] = user.id
            return redirect(url_for("index"))
        return render_template("login.html", error="Credenciais inválidas")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        role = request.form.get("role", "vendedor")
        if User.query.filter_by(username=username).first():
            return render_template("register.html", error="Usuário já existe")
        user = User(username=username, password_hash=generate_password_hash(password), role=role)
        db.session.add(user)
        db.session.commit()
        return redirect(url_for("login"))
    return render_template("register.html")

@app.route("/")
def index():
    if not g.user:
        return redirect(url_for("login"))
    today = date.today()
    week_end = today + timedelta(days=7)
    month_end = date(today.year, today.month, 28) + timedelta(days=4)
    month_end = month_end - timedelta(days=month_end.day)
    query = Contract.query
    if g.user.role == "vendedor":
        v = Vendor.query.filter_by(user_id=g.user.id).first()
        query = query.filter_by(vendor_id=v.id) if v else query.filter_by(vendor_id=-1)
    contratos_hoje = query.filter(Contract.end_date == today).all()
    contratos_semana = query.filter(Contract.end_date <= week_end, Contract.end_date >= today).all()
    contratos_mes = query.filter(Contract.end_date <= month_end, Contract.end_date >= date(today.year, today.month, 1)).all()
    return render_template("dashboard.html", contratos_hoje=contratos_hoje, contratos_semana=contratos_semana, contratos_mes=contratos_mes)

@app.route("/clientes")
def clientes():
    if not g.user:
        return redirect(url_for("login"))
    lista = Client.query.order_by(Client.nome_fantasia).all()
    return render_template("clientes.html", clientes=lista)

@app.route("/clientes/novo", methods=["GET", "POST"])
def clientes_novo():
    if not g.user:
        return redirect(url_for("login"))
    if request.method == "POST":
        c = Client(
            razao_social=request.form.get("razao_social"),
            nome_fantasia=request.form.get("nome_fantasia"),
            cnpj=request.form.get("cnpj"),
            inscricao_estadual=request.form.get("inscricao_estadual"),
            telefone=request.form.get("telefone"),
            celular=request.form.get("celular"),
            rua=request.form.get("rua"),
            numero=request.form.get("numero"),
            complemento=request.form.get("complemento"),
            bairro=request.form.get("bairro"),
            cidade=request.form.get("cidade"),
            cep=request.form.get("cep"),
        )
        db.session.add(c)
        db.session.commit()
        return redirect(url_for("clientes"))
    return render_template("clientes_form.html")

@app.route("/vendedores")
def vendedores():
    if not g.user:
        return redirect(url_for("login"))
    lista = Vendor.query.order_by(Vendor.nome).all()
    return render_template("vendedores.html", vendedores=lista)

@app.route("/vendedores/novo", methods=["GET", "POST"])
@role_required("secretaria", "direcao")
def vendedores_novo():
    if request.method == "POST":
        nome = request.form.get("nome")
        cpf = request.form.get("cpf")
        user_link = request.form.get("user_link")
        user = User.query.filter_by(username=user_link).first() if user_link else None
        v = Vendor(nome=nome, cpf=cpf, user_id=user.id if user else None)
        db.session.add(v)
        db.session.commit()
        return redirect(url_for("vendedores"))
    users = User.query.all()
    return render_template("vendedores_form.html", users=users)

@app.route("/contratos")
def contratos():
    if not g.user:
        return redirect(url_for("login"))
    query = Contract.query
    if g.user.role == "vendedor":
        v = Vendor.query.filter_by(user_id=g.user.id).first()
        query = query.filter_by(vendor_id=v.id) if v else query.filter_by(vendor_id=-1)
    lista = query.order_by(Contract.start_date.desc()).all()
    clientes = {c.id: c for c in Client.query.all()}
    vendedores = {v.id: v for v in Vendor.query.all()}
    return render_template("contratos.html", contratos=lista, clientes=clientes, vendedores=vendedores)

@app.route("/contratos/novo", methods=["GET", "POST"])
def contratos_novo():
    if not g.user:
        return redirect(url_for("login"))
    if request.method == "POST":
        client_id = int(request.form.get("cliente"))
        vendor_id = int(request.form.get("vendedor"))
        start_date = datetime.strptime(request.form.get("inicio"), "%Y-%m-%d").date()
        end_date = datetime.strptime(request.form.get("fim"), "%Y-%m-%d").date()
        periodo_total = (end_date - start_date).days + 1
        c = Contract(
            client_id=client_id,
            start_date=start_date,
            end_date=end_date,
            descricao=request.form.get("descricao"),
            insercoes_por_dia=int(request.form.get("insercoes") or 0),
            horarios=request.form.get("horarios"),
            periodo_total=periodo_total,
            vendor_id=vendor_id,
            tipo=request.form.get("tipo"),
        )
        if g.user.role == "vendedor":
            v = Vendor.query.filter_by(user_id=g.user.id).first()
            if not v or v.id != vendor_id:
                return redirect(url_for("contratos"))
        db.session.add(c)
        db.session.commit()
        return redirect(url_for("contratos"))
    clientes = Client.query.order_by(Client.nome_fantasia).all()
    vendedores = Vendor.query.order_by(Vendor.nome).all()
    return render_template("contratos_form.html", clientes=clientes, vendedores=vendedores)

@app.route("/faturas")
def faturas():
    if not g.user:
        return redirect(url_for("login"))
    query = Invoice.query.join(Contract)
    if g.user.role == "vendedor":
        v = Vendor.query.filter_by(user_id=g.user.id).first()
        query = query.filter(Contract.vendor_id == v.id) if v else query.filter(Contract.vendor_id == -1)
    lista = query.order_by(Invoice.due_date.desc()).all()
    return render_template("faturas.html", faturas=lista)

@app.route("/faturas/novo", methods=["GET", "POST"])
def faturas_novo():
    if not g.user:
        return redirect(url_for("login"))
    if request.method == "POST":
        contract_id = int(request.form.get("contrato"))
        due_date = datetime.strptime(request.form.get("vencimento"), "%Y-%m-%d").date()
        valor = float(request.form.get("valor"))
        status = request.form.get("status")
        forma_pagamento = request.form.get("forma_pagamento")
        contrato = Contract.query.get(contract_id)
        if g.user.role == "vendedor":
            v = Vendor.query.filter_by(user_id=g.user.id).first()
            if not v or contrato.vendor_id != v.id:
                return redirect(url_for("faturas"))
        f = Invoice(contract_id=contract_id, due_date=due_date, valor=valor, status=status, forma_pagamento=forma_pagamento)
        db.session.add(f)
        db.session.commit()
        return redirect(url_for("faturas"))
    query = Contract.query
    if g.user.role == "vendedor":
        v = Vendor.query.filter_by(user_id=g.user.id).first()
        query = query.filter_by(vendor_id=v.id) if v else query.filter_by(vendor_id=-1)
    contratos = query.order_by(Contract.start_date.desc()).all()
    return render_template("faturas_form.html", contratos=contratos)

@app.route("/relatorios", methods=["GET", "POST"])
@role_required("direcao")
def relatorios():
    inicio = request.form.get("inicio") if request.method == "POST" else request.args.get("inicio")
    fim = request.form.get("fim") if request.method == "POST" else request.args.get("fim")
    if not inicio or not fim:
        hoje = date.today()
        inicio = date(hoje.year, hoje.month, 1)
        fim = date(hoje.year, hoje.month, 28) + timedelta(days=4)
        fim = fim - timedelta(days=fim.day)
    else:
        inicio = datetime.strptime(inicio, "%Y-%m-%d").date()
        fim = datetime.strptime(fim, "%Y-%m-%d").date()
    faturas = Invoice.query.filter(Invoice.due_date >= inicio, Invoice.due_date <= fim).all()
    total_mes = sum(f.valor for f in faturas)
    por_vendedor = {}
    for f in faturas:
        v = f.contract.vendor
        por_vendedor[v.nome] = por_vendedor.get(v.nome, 0) + f.valor
    return render_template("relatorios.html", total_mes=total_mes, por_vendedor=por_vendedor, inicio=inicio, fim=fim)

@app.route("/relatorios/export")
@role_required("direcao")
def relatorios_export():
    inicio = datetime.strptime(request.args.get("inicio"), "%Y-%m-%d").date()
    fim = datetime.strptime(request.args.get("fim"), "%Y-%m-%d").date()
    faturas = Invoice.query.filter(Invoice.due_date >= inicio, Invoice.due_date <= fim).all()
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Contrato", "Vendedor", "Cliente", "Vencimento", "Valor", "Status", "Forma de Pagamento"])
    for f in faturas:
        writer.writerow([f.contract.id, f.contract.vendor.nome, f.contract.client.nome_fantasia, f.due_date.isoformat(), f.valor, f.status, f.forma_pagamento])
    output.seek(0)
    return send_file(output, mimetype="text/csv", as_attachment=True, download_name="relatorio.csv")

def init_db():
    db.create_all()
    if not User.query.filter_by(username="admin").first():
        u = User(username="admin", password_hash=generate_password_hash("admin"), role="direcao")
        db.session.add(u)
        db.session.commit()

if __name__ == "__main__":
    with app.app_context():
        init_db()
    app.run(debug=True)
