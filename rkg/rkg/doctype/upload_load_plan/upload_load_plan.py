# Copyright (c) 2026, developer and contributors
# For license information, please see license.txt

import frappe
import csv
import io
from frappe.model.document import Document
from frappe.utils import cint

class UploadLoadPlan(Document):
    pass

@frappe.whitelist()
def process_csv(upload_doc):
    upload = frappe.get_doc("Upload Load Plan", upload_doc)

    if not upload.attach_load_plan:
        frappe.throw("Please attach CSV file")

    file_doc = frappe.get_doc("File", {"file_url": upload.attach_load_plan})
    content = file_doc.get_content()

    reader = csv.DictReader(io.StringIO(content))

    created = 0
    updated = 0
    rows_added = 0
    total_qty = 0

    load_plan_map = {}

    for row in reader:
        ref = (row.get("Load Reference No") or "").strip()

        if not ref:
            continue

        # Create or fetch Load Plan (NAME = Load Reference No)
        if ref not in load_plan_map:
            if frappe.db.exists("Load Plan", ref):
                lp = frappe.get_doc("Load Plan", ref)
                updated += 1
            else:
                lp = frappe.new_doc("Load Plan")
                lp.load_reference_no = ref
                lp.dispatch_plan_date = row.get("Dispatch Plan Date")
                lp.payment_plan_date = row.get("Payment Plan Date")
                total_qty =cint(row.get("Quantity"))
                lp.total_qty = total_qty
                
                lp.insert(ignore_permissions=True)
                created += 1

            load_plan_map[ref] = lp

        lp = load_plan_map[ref]

        # Duplicate prevention
        exists = any(
            item.model == row.get("Model") and
            item.variant == row.get("Variant") and
            item.color == row.get("Color")
            for item in lp.load_items
        )

        if exists:
            continue


        lp.append("load_items", {
            "model": row.get("Model"),
            "model_name": row.get("Model Name"),
            "type": row.get("Type"),
            "variant": row.get("Variant"),
            "color": row.get("Color"),
            "group_color": row.get("Group Color"),
            "option": row.get("Option"),
            "quantity": cint(row.get("Quantity"))
        })
		
        rows_added += 1

    for lp in load_plan_map.values():
        lp.save(ignore_permissions=True)

    frappe.db.commit()

    return (
        f"CSV processed successfully<br>"
        f"Load Plans Created: {created}<br>"
        f"Load Plans Updated: {updated}<br>"
        f"Rows Inserted: {rows_added}"
    )

