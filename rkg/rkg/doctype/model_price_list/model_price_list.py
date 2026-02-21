# Copyright (c) 2026, developer and contributors
# For license information, please see license.txt
import frappe
from frappe.model.document import Document


class ModelPriceList(Document):
	def validate(self):
		if not self.general_insurance_provider:
			settings = frappe.get_doc("RKG Settings","RKG Settings")
			self.db_set("general_insurance_provider",settings.default_general_insurance_provider)
		if not self.nd_insurance_provider:
			settings = frappe.get_doc("RKG Settings","RKG Settings")
			self.db_set("nd_insurance_provider",settings.default_nd_insurance_provider)