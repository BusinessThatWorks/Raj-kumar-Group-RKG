import frappe
from frappe.utils import getdate
from rkg.utils.common import fiscal_year_set


def autoname_sales_order(doc, method=None):

    # 1️⃣ Validate
    if not doc.transaction_date:
        frappe.throw("Transaction Date is required")

    posting_date = getdate(doc.transaction_date)

    # 2️⃣ If AUTO found in naming_series → run custom logic
    if doc.naming_series and "AUTO" in doc.naming_series.upper():

        if not doc.cost_center:
            frappe.throw("Cost Center is required")

        # Cost Center abbreviation
        cc_abbr = frappe.db.get_value(
            "Cost Center",
            doc.cost_center,
            "abbreviation"
        )
        if not cc_abbr:
            frappe.throw(f"Abbreviation not found for Cost Center {doc.cost_center}")

        # Fiscal Year
        fy = fiscal_year_set(posting_date)
        if not fy:
            frappe.throw(f"Fiscal Year not found for transaction date {posting_date}")

        fy_code = f"{str(fy['year_start_date'].year)[-2:]}{str(fy['year_end_date'].year)[-2:]}"

        # 🔥 Completely ignore naming_series value
        prefix = f"{cc_abbr}-SO-{fy_code}-"

        # Get last sequence
        last = frappe.db.sql(
            """
            SELECT name FROM `tabSales Order`
            WHERE name LIKE %s
            ORDER BY name DESC
            LIMIT 1
            """,
            (prefix + "%",),
            as_list=True
        )

        seq = int(last[0][0].split("-")[-1]) + 1 if last else 1

        doc.name = f"{prefix}{str(seq).zfill(5)}"

    # 3️⃣ Otherwise → Let Frappe default naming work
    else:
        doc.name = None
