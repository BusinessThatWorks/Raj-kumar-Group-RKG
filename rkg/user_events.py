import frappe

def user_before_insert(doc, method=None):
    role = "Godown Incharge"

    if not frappe.db.exists("Role", role):
        return

    if not any(r.role == role for r in doc.roles):
        doc.append("roles", {"role": role})
