import frappe
from frappe.model.document import Document


class PurchaseType(Document):

    def autoname(self):

        if not self.type_name or not self.cost_center:
            frappe.throw("Type Name and Cost Center are required")

        abbr = frappe.db.get_value(
            "Cost Center",
            self.cost_center,
            "abbreviation"
        )

        if not abbr:
            frappe.throw("Cost Center Abbreviation is not set")

        clean_type = self.type_name.strip().rstrip("-").strip()

        # Custom Name
        self.name = f"{clean_type}-{abbr}"
