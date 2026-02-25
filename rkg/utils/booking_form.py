import frappe
from frappe.utils import getdate
from rkg.utils.common import fiscal_year_set


def autoname_booking_form_entry(doc, method=None):

    if not doc.booking_date:
        frappe.throw("Booking Date is required")

    booking_date = getdate(doc.booking_date)

    if not doc.cost_center:
        frappe.throw("Cost Center is required")

    cc_abbr = frappe.db.get_value(
        "Cost Center",
        doc.cost_center,
        "abbreviation"
    )

    if not cc_abbr:
        frappe.throw("Cost Center abbreviation not found")

    fy = fiscal_year_set(booking_date)

    if not fy:
        frappe.throw(
            f"Enabled Fiscal Year not found for booking date {booking_date}"
        )

    fy_code = (
        f"{str(fy['year_start_date'].year)[-2:]}"
        f"{str(fy['year_end_date'].year)[-2:]}"
    )

    prefix = f"{cc_abbr}-BO-{fy_code}-"

    # Get last sequence
    last = frappe.db.sql(
        """
        SELECT name FROM `tabBooking Form`
        WHERE name LIKE %s
        ORDER BY name DESC
        LIMIT 1
        """,
        (prefix + "%",),
        as_list=True
    )

    seq = 1

    if last:
        try:
            seq = int(last[0][0].split("-")[-1]) + 1
        except Exception:
            seq = 1

    doc.name = f"{prefix}{str(seq).zfill(4)}"

    return doc.name