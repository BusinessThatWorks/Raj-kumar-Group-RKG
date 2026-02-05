# -*- coding: utf-8 -*-
import frappe
from frappe.model.document import Document

class DamageAssessment(Document):
    pass


@frappe.whitelist()
def get_items_from_load_dispatch(load_dispatch):
    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    items = []
    for row in ld.items:   # ⚠️ use correct child table fieldname
        items.append({
            "frame_no": row.item_code
        })

    return {
        "load_reference_number": ld.linked_load_reference_no,  # or ld.load_plan
        "items": items
    }