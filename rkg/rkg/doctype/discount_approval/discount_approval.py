import frappe
from frappe.model.document import Document


class DiscountApproval(Document):

    def before_insert(self):
        self.created_by = self.owner