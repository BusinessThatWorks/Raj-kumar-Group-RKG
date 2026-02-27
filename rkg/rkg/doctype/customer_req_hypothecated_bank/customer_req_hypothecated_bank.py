import frappe
from frappe.model.document import Document
from frappe.utils import flt


class CustomerReqHypothecatedBank(Document):

    def validate(self):

        # ✅ Booking form mandatory
        if not self.booking_form:
            frappe.throw("Booking Form reference is mandatory")

        # ✅ Bank name mandatory
        if not self.bank_name:
            frappe.throw("Bank Name is required")

        # ✅ Prevent duplicate bank per booking form
        if frappe.db.exists(
            "Customer Req Hypothecated Bank",
            {
                "booking_form": self.booking_form,
                "bank_name": self.bank_name,
                "name": ["!=", self.name]
            }
        ):
            frappe.throw("This bank already exists for this Booking Form")