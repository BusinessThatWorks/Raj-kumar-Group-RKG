import frappe
from frappe.utils import getdate
from rkg.utils.common import fiscal_year_set

def autoname_sales_invoice(doc, method=None):
    # ----------------- Validate -----------------
    if not doc.posting_date:
        frappe.throw("Posting Date is required")
    if not doc.cost_center:
        frappe.throw("Cost Center is required")

    posting_date = getdate(doc.posting_date)

    # ----------------- Custom logic trigger -----------------
    # Use naming_series as a trigger only; remove SI-AUTO- from prefix
    if doc.naming_series and "AUTO" in doc.naming_series.upper():
        # 1️⃣ Cost Center abbreviation
        cc_abbr = frappe.db.get_value("Cost Center", doc.cost_center, "abbreviation")
        if not cc_abbr:
            frappe.throw(f"Abbreviation not found for Cost Center {doc.cost_center}")

        fy = fiscal_year_set(posting_date)

        if not fy:
            frappe.throw(f"Fiscal Year not found for posting date {posting_date}")
        fy_code = f"{str(fy.year_start_date.year)[-2:]}{str(fy.year_end_date.year)[-2:]}"

        # 3️⃣ Determine type code
        if getattr(doc, "is_debit_note", 0):
            doc_type_code = "DI"
        elif getattr(doc, "is_return", 0):
            doc_type_code = "CI"
        else:
            doc_type_code = "TI"

        # 4️⃣ Prepare prefix (remove "SI-AUTO-" from naming_series)
        # Current
        base = doc.naming_series.replace("SI-AUTO-", "").replace(".YYYY.", "").rstrip(".")
        prefix = f"/{base}{cc_abbr}-{doc_type_code}-{fy_code}-"

        # Remove the leading slash
        base = base.lstrip("-")  # remove any leading dash
        prefix = f"{base}{cc_abbr}-{doc_type_code}-{fy_code}-"



        # 5️⃣ Get last sequence number
        last = frappe.db.sql(
            """
            SELECT name FROM `tabSales Invoice`
            WHERE name LIKE %s
            ORDER BY name DESC
            LIMIT 1
            """,
            (prefix + "%",),
            as_list=True
        )

        seq = int(last[0][0].split("-")[-1]) + 1 if last else 1

        # 6️⃣ Assign final name
        doc.name = f"{prefix}{str(seq).zfill(3)}"

    else:
        # ----------------- Let Frappe handle system series -----------------
        doc.name = None
