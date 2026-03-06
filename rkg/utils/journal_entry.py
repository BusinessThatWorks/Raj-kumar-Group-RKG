import frappe
from frappe.utils import getdate, flt
from rkg.utils.common import fiscal_year_set

# =====================================================
# AUTONAME FOR JOURNAL ENTRY
# =====================================================
def autoname_journal_entry(doc, method=None):

    if not doc.posting_date:
        frappe.throw("Posting Date is required")

    posting_date = getdate(doc.posting_date)

    if not doc.naming_series:
        frappe.throw("Naming Series is required")

    # Let Frappe handle series ending with YYYY
    if "YYYY" in doc.naming_series.upper():
        doc.name = None
        return

    # Custom logic if YYYY not present
    fy = fiscal_year_set(posting_date)
    if not fy:
        frappe.throw(f"Enabled Fiscal Year not found for posting date {posting_date}")

    fy_code = f"{str(fy['year_start_date'].year)[-2:]}{str(fy['year_end_date'].year)[-2:]}"
    series_prefix = doc.naming_series.replace(".", "").strip("-")
    prefix = f"{series_prefix}-{fy_code}-"

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

    doc.name = f"{prefix}{str(seq).zfill(4)}"


# =====================================================
# HOOK FUNCTIONS TO UPDATE BOOKING FORM PAYMENT
# =====================================================
def update_booking_amount_recieved(doc, method=None):

    for acc in doc.accounts:

        if (
            acc.reference_type == "Booking Form"
            and acc.reference_name
            and flt(acc.credit_in_account_currency) > 0
        ):

            if not frappe.db.exists("Booking Form", acc.reference_name):
                continue

            booking = frappe.get_doc("Booking Form", acc.reference_name)

            payment_amount = flt(acc.credit_in_account_currency)

            current_amount = flt(booking.amount_recieved)

            new_amount = current_amount + payment_amount

            frappe.db.set_value(
                "Booking Form",
                booking.name,
                "amount_recieved",
                new_amount
            )

def revert_booking_amount_recieved(doc, method=None):

    for acc in doc.accounts:

        if acc.is_advance == 1:
            acc.is_advance = "Yes"
        elif acc.is_advance == 0:
            acc.is_advance = "No"

        if (
            acc.reference_type == "Booking Form"
            and acc.reference_name
            and flt(acc.credit_in_account_currency) > 0
        ):

            if not frappe.db.exists("Booking Form", acc.reference_name):
                continue

            booking = frappe.get_doc("Booking Form", acc.reference_name)

            payment_amount = flt(acc.credit_in_account_currency)

            new_amount = flt(booking.amount_recieved) - payment_amount

            booking.db_set(
                "amount_recieved",
                new_amount,
                update_modified=False
            )