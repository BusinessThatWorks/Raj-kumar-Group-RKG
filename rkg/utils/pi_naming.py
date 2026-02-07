import frappe

def autoname(doc, method=None):
    if not doc.posting_date:
        frappe.throw("Posting Date is required")

    base = doc.naming_series or "ACC-PINV"
    posting_date = doc.posting_date

    fy = frappe.db.get_value(
        "Fiscal Year",
        {
            "year_start_date": ("<=", posting_date),
            "year_end_date": (">=", posting_date),
            "disabled": 0
        },
        ["year_start_date", "year_end_date"],
        as_dict=True
    )

    if not fy:
        frappe.throw("Fiscal Year not found")

    fy_code = f"{str(fy['year_start_date'].year)[-2:]}{str(fy['year_end_date'].year)[-2:]}"

    prefix = f"{base}-{fy_code}-"

    last = frappe.db.sql(
        """
        SELECT name FROM `tabPurchase Invoice`
        WHERE name LIKE %s
        ORDER BY name DESC
        LIMIT 1
        """,
        (prefix + "%",),
        as_list=True
    )

    seq = int(last[0][0].split("-")[-1]) + 1 if last else 1

    doc.name = f"{prefix}{str(seq).zfill(5)}"
