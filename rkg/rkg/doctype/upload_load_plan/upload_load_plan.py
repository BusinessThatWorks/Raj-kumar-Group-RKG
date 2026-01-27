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
    upload_doc = frappe.get_doc("Upload Load Plan", upload_doc)

    if not upload_doc.attach_load_plan:
        frappe.throw("Please attach CSV file")

    file_doc = frappe.get_doc("File", {"file_url": upload_doc.attach_load_plan})
    csv_content = file_doc.get_content()

    import csv, io
    reader = csv.DictReader(io.StringIO(csv_content))

    for row in reader:
        load_reference_no = row.get("Load Reference No")

        if not load_reference_no:
            continue

        if frappe.db.exists("Load Plan", load_reference_no):
            load_plan = frappe.get_doc("Load Plan", load_reference_no)
            # existing qty (handle None)
            existing_qty = load_plan.total_qty or 0
            new_qty = int(row.get("Quantity") or 0)

            load_plan.total_qty = existing_qty + new_qty
            load_plan.status =  'Planned'
            load_plan.save(ignore_permissions=True)
        else:
            load_plan = frappe.new_doc("Load Plan")
            load_plan.name = load_reference_no
            load_plan.load_reference_no = load_reference_no
            load_plan.dispatch_plan_date = row.get("Dispatch Plan Date")
            load_plan.payment_plan_date = row.get("Payment Plan Date")
            load_plan.total_qty = int(row.get("Quantity") or 0)
            load_plan.insert(ignore_permissions=True)

        load_plan.append("load_items", {
            "model": row.get("Model"),
            "model_name": row.get("Model Name"),
            "type": row.get("Type"),
            "variant": row.get("Variant"),
            "color": row.get("Color"),
            "group_color": row.get("Group Color"),
            "option": row.get("Option"),
            "quantity": int(row.get("Quantity") or 0)
        })

        load_plan.save(ignore_permissions=True)

    frappe.db.commit()

    return "CSV uploaded successfully"
