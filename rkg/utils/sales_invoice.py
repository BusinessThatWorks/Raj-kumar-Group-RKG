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

    # ----------------- Custom AUTO Trigger -----------------
    if doc.naming_series and "AUTO" in doc.naming_series.upper():

        # 1️⃣ Get Cost Center Abbreviation
        cc_abbr = frappe.db.get_value(
            "Cost Center",
            doc.cost_center,
            "abbreviation"
        )

        if not cc_abbr:
            frappe.throw(f"Abbreviation not found for Cost Center {doc.cost_center}")

        cc_abbr = cc_abbr.strip().upper()

        # 🔒 GST Safety: limit abbreviation length
        if len(cc_abbr) > 4:
            frappe.throw("Cost Center Abbreviation must be 4 characters or fewer (GST limit)")

        # 2️⃣ Fiscal Year Code (e.g., 2526)
        fy = fiscal_year_set(posting_date)

        if not fy:
            frappe.throw(f"Fiscal Year not found for posting date {posting_date}")

        fy_code = f"{str(fy.year_start_date.year)[-2:]}{str(fy.year_end_date.year)[-2:]}"

        # 3️⃣ Document Type Code
        if getattr(doc, "is_debit_note", 0):
            doc_type_code = "DI"
        elif getattr(doc, "is_return", 0):
            doc_type_code = "CI"
        else:
            doc_type_code = "TI"

        # 4️⃣ Compact GST-Safe Prefix
        # Format: CCTYPFYYYY + 001
        # Example: MDTI2526001
        prefix = f"{cc_abbr}-{doc_type_code}{fy_code}"

        # 5️⃣ Get Last Sequence (3 digits only)
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

        seq = int(last[0][0][-3:]) + 1 if last else 1

        # 🔒 Limit to 001–999
        if seq > 999:
            frappe.throw("Maximum 999 invoices allowed per prefix (GST Safe Limit)")

        seq_str = str(seq).zfill(3)

        final_name = f"{prefix}-{seq_str}"

        # 6️⃣ Strict GST Validation (≤16 chars)
        if len(final_name) > 16:
            frappe.throw(
                f"Generated Invoice No '{final_name}' exceeds 16 characters "
                f"({len(final_name)}). Please shorten Cost Center Abbreviation."
            )

        doc.name = final_name

    else:
        # ----------------- Default Naming Series -----------------
        doc.name = None
