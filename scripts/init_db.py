import os
from werkzeug.security import generate_password_hash
from app import db, app, User

def main():
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username="admin").first():
            db.session.add(User(username="admin", password_hash=generate_password_hash("admin"), role="direcao"))
        if not User.query.filter_by(username="secretaria").first():
            db.session.add(User(username="secretaria", password_hash=generate_password_hash("secretaria"), role="secretaria"))
        if not User.query.filter_by(username="vendedor").first():
            db.session.add(User(username="vendedor", password_hash=generate_password_hash("vendedor"), role="vendedor"))
        db.session.commit()

if __name__ == "__main__":
    main()
