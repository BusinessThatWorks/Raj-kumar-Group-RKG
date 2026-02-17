import frappe
from frappe.utils import getdate
from rkg.utils.common import fiscal_year_set

def autoname_delivery_note(doc, method=None):
    if not doc.posting_date:
        frappe.throw("Posting Date is required")
    if not doc.cost_center:
        frappe.throw("Cost Center is required")

    posting_date = getdate(doc.posting_date)

    if doc.naming_series and "AUTO" in doc.naming_series.upper():
        # Cost Center Abbreviation
        cc_abbr = frappe.db.get_value("Cost Center", doc.cost_center, "abbreviation")
        if not cc_abbr:
            frappe.throw(f"Abbreviation not found for Cost Center {doc.cost_center}")

        # Fiscal Year
        fy = fiscal_year_set(posting_date)
        if not fy:
            frappe.throw(f"Fiscal Year not found for posting date {posting_date}")
            
        fy_code = f"{str(fy['year_start_date'].year)[-2:]}{str(fy['year_end_date'].year)[-2:]}"

        # Delivery Note type
        doc_type_code = "DNR" if getattr(doc, "is_return", 0) else "DO"

        # Clean base from naming series
        base = doc.naming_series.replace("AUTO", "").replace(".YYYY.", "").strip("-")

        # Build prefix safely
        prefix_parts = [base, cc_abbr, doc_type_code, fy_code]
        prefix = "-".join(part for part in prefix_parts if part) + "-"

        # Get last sequence
        last = frappe.db.sql(
            """
            SELECT name FROM `tabDelivery Note`
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
        doc.name = None
