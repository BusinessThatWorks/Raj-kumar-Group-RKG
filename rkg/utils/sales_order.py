import frappe
from frappe.utils import getdate
from rkg.utils.common import fiscal_year_set  # for Fiscal Year

def autoname_sales_order(doc, method=None):
    # ----------------- 1️⃣ Validate mandatory fields -----------------
    if not doc.transaction_date:
        frappe.throw("Transaction Date is required")

    # ----------------- 2️⃣ Check if Sales Type is selected -----------------
    if doc.sales_type:  # <-- only apply custom naming if Sales Type selected
        if not doc.cost_center:
            frappe.throw("Cost Center is required")

        posting_date = getdate(doc.transaction_date)

        # Cost Center abbreviation
        cc_abbr = frappe.db.get_value("Cost Center", doc.cost_center, "abbreviation")
        if not cc_abbr:
            frappe.throw(f"Abbreviation not found for Cost Center {doc.cost_center}")

        # Fiscal Year
        fy = fiscal_year_set(posting_date)
        if not fy:
            frappe.throw(f"Fiscal Year not found for transacction date {posting_date}")
        fy_code = f"{str(fy['year_start_date'].year)[-2:]}{str(fy['year_end_date'].year)[-2:]}"  # e.g., 2526

        # Base from naming series (.YYYY. kept as-is)
        base = (doc.naming_series or "").rstrip(".")
        while "--" in base:
            base = base.replace("--", "-")

        # Build prefix: base + CC + SO + Fiscal Year
        prefix_parts = [base, cc_abbr, "SO", fy_code]
        prefix = "-".join(part for part in prefix_parts if part) + "-"

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

        # Assign final name
        doc.name = f"{prefix}{str(seq).zfill(5)}"

    else:
        # ----------------- 3️⃣ No Sales Type → let system series handle naming -----------------
        doc.name = None  # Frappe will use series selected in the Series field
