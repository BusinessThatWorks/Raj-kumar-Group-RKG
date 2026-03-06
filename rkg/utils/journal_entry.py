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

    if "YYYY" in doc.naming_series.upper():
        doc.name = None
        return

    fy = fiscal_year_set(posting_date)
    if not fy:
        frappe.throw(f"Enabled Fiscal Year not found for posting date {posting_date}")

    fy_code = f"{str(fy['year_start_date'].year)[-2:]}{str(fy['year_end_date'].year)[-2:]}"
    series_prefix = doc.naming_series.replace(".", "").strip("-")
    prefix = f"{series_prefix}-{fy_code}-"

    last = frappe.db.sql(
        """SELECT name FROM `tabJournal Entry`
           WHERE name LIKE %s
           ORDER BY name DESC
           LIMIT 1""",
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




def validate_cost_center_series(doc, method):
    """
    Validate that naming series matches cost center.
    Allow all cost centers only if series is ACC-JV-.YYYY.-
    """
    if doc.naming_series.startswith("ACC-JV-.YYYY.-"):
        # Free choice for this series
        return

    # For other series, parent cost center is mandatory
    if not doc.cost_center:
        frappe.throw("Parent Cost Center is required.")

    abbr = frappe.db.get_value("Cost Center", doc.cost_center, "abbreviation")
    if not abbr:
        frappe.throw(f"Cost Center {doc.cost_center} abbreviation not found")

    last_part = doc.naming_series.split("-")[-1]
    if last_part.upper() != abbr.upper():
        frappe.throw(f"Naming series ({doc.naming_series}) must match parent cost center ({abbr}).")

    # All child accounts must match parent cost center
    for row in doc.accounts:
        if row.cost_center != doc.cost_center:
            frappe.throw(f"Child cost center ({row.cost_center}) must match parent ({doc.cost_center}).")


# =====================================================
# HOOK FUNCTIONS TO UPDATE BOOKING FORM PAYMENT
# =====================================================
def update_booking_amount_recieved(doc, method=None):
    """
    Sum all submitted Journal Entries linked to Booking Form
    and update 'amount_recieved' field.
    """
    linked_bookings = set()
    for acc in doc.accounts:
        if acc.reference_type == "Booking Form" and acc.reference_name:
            linked_bookings.add(acc.reference_name)

    for booking_name in linked_bookings:
        total_paid = frappe.db.sql(
            """
            SELECT SUM(credit_in_account_currency) FROM `tabJournal Entry Account` AS je_acc
            JOIN `tabJournal Entry` AS je ON je.name = je_acc.parent
            WHERE je.docstatus = 1
            AND je_acc.reference_type = 'Booking Form'
            AND je_acc.reference_name = %s
            """,
            (booking_name,)
        )[0][0] or 0

        frappe.db.set_value("Booking Form", booking_name, "amount_recieved", flt(total_paid))


def revert_booking_amount_recieved(doc, method=None):
    """
    Recalculate Booking Form's amount_recieved after JE cancel/trash.
    """
    update_booking_amount_recieved(doc, method)  # Reuse same logic

def update_reference_numbers(doc, method=None):
    """
    Collect all Booking Form reference_name values from child table
    and store in parent field 'booking_references'.
    """
    refs = []
    for acc in doc.accounts:
        if acc.reference_type == "Booking Form" and acc.reference_name:
            refs.append(acc.reference_name)
    doc.booking_references = ", ".join(refs)


