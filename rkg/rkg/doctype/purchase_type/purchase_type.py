# Copyright (c) 2026, developer and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PurchaseType(Document):

    def autoname(self):
        if not self.type_name or not self.cost_center:
            frappe.throw("Purchase Type and Cost Center are required")

        # Use Cost Center instead of Series
        self.name = f"{self.type_name.strip()} ({self.cost_center.strip()})"
