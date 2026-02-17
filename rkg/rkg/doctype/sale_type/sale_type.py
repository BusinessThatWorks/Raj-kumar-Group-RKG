import frappe
from frappe.model.document import Document


class SaleType(Document):

    def validate(self):

        # ---------------------------
        # Mandatory Check
        # ---------------------------
        if not self.type_name or not self.cost_center:
            frappe.throw("Type Name and Cost Center are required")

        # ---------------------------
        # Get Cost Center Abbreviation
        # ---------------------------
        abbr = frappe.db.get_value(
            "Cost Center",
            self.cost_center,
            "abbreviation"
        )

        if not abbr:
            frappe.throw("Cost Center Abbreviation is not set")

        abbr = abbr.strip()

        # =====================================================
        # 1️⃣ AUTO UPDATE DOCUMENT ID (type_name - ABBR)
        # =====================================================

        clean_type = self.type_name.strip().rstrip("-").strip()
        self.name = f"{clean_type} - {abbr}"

