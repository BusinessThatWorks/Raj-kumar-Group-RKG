import frappe
from frappe.utils import getdate
from rkg.utils.common import fiscal_year_set


def autoname_journal_entry(doc, method=None):

    # 1️⃣ Validate Posting Date
    if not doc.posting_date:
        frappe.throw("Posting Date is required")

    posting_date = getdate(doc.posting_date)

    if not doc.naming_series:
        frappe.throw("Naming Series is required")

    # ---------------------------------------------------
    # ✅ If series contains YYYY → Let Frappe handle it
    # ---------------------------------------------------
    if "YYYY" in doc.naming_series.upper():
        doc.name = None
        return

    # ---------------------------------------------------
    # ✅ Custom logic only when YYYY NOT present
    # ---------------------------------------------------

    # Get Fiscal Year
    fy = fiscal_year_set(posting_date)

    if not fy:
        frappe.throw(
            f"Enabled Fiscal Year not found for posting date {posting_date}"
        )

    fy_code = (
        f"{str(fy['year_start_date'].year)[-2:]}"
        f"{str(fy['year_end_date'].year)[-2:]}"
    )

    # Clean series prefix
    series_prefix = doc.naming_series.replace(".", "").strip("-")

    # Final prefix
    # Example: ACC-TS-2526-
    prefix = f"{series_prefix}-{fy_code}-"

    # Get last sequence
    last = frappe.db.sql(
        """
        SELECT name FROM `tabJournal Entry`
        WHERE name LIKE %s
        ORDER BY name DESC
        LIMIT 1
        """,
        (prefix + "%",),
        as_list=True
    )

    if last:
        try:
            last_seq = int(last[0][0].split("-")[-1])
            seq = last_seq + 1
        except:
            seq = 1
    else:
        seq = 1

    # Final name (4 digit sequence)
    doc.name = f"{prefix}{str(seq).zfill(4)}"
