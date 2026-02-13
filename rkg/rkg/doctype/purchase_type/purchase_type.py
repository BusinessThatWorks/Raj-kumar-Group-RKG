import frappe
from frappe.model.document import Document

class PurchaseType(Document):

    def autoname(self):
        if not self.type_name or not self.series:
            frappe.throw("Purchase Type and Series are required")

        type_name = self.type_name.strip()
        series = self.series.strip()

        # Set Name
        self.name = f"{type_name} ({series})"

        # Check for duplicate combination
        if frappe.db.exists(
            "Purchase Type",
            {
                "type_name": type_name,
                "series": series,
                "name": ["!=", self.name]
            }
        ):
            frappe.throw("This Purchase Type and Series combination already exists.")
