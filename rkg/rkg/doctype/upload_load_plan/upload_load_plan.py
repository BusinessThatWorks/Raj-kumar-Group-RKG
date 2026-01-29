import frappe
import csv
import io
from frappe.model.document import Document
from frappe.utils import now_datetime   # ✅ REQUIRED

class UploadLoadPlan(Document):
    def autoname(self):
        dt = now_datetime()
        self.name = f"ALP-{dt.strftime('%Y%m%d-%H%M%S')}"

@frappe.whitelist()
def process_csv(upload_doc):
    upload_doc = frappe.get_doc("Upload Load Plan", upload_doc)

    if not upload_doc.attach_load_plan:
        frappe.throw("Please attach CSV file")

    file_doc = frappe.get_doc("File", {"file_url": upload_doc.attach_load_plan})
    csv_content = file_doc.get_content()
    reader = csv.DictReader(io.StringIO(csv_content))

    for row in reader:
        load_reference_no = row.get("Load Reference No")
        if not load_reference_no:
            continue

        incoming_qty = int(row.get("Quantity") or 0)

        # ✅ Fetch existing Load Plan ignoring cancelled docs
        existing_name = frappe.db.get_value(
            "Load Plan",
            {
                "load_reference_no": load_reference_no,
                "docstatus": ["!=", 2]  # ignore cancelled
            },
            "name"
        )

        if existing_name:
            load_plan = frappe.get_doc("Load Plan", existing_name)
            load_plan.total_qty = (load_plan.total_qty or 0) + incoming_qty
        else:
            load_plan = frappe.new_doc("Load Plan")
            load_plan.load_reference_no = load_reference_no
            load_plan.dispatch_plan_date = row.get("Dispatch Plan Date")
            load_plan.payment_plan_date = row.get("Payment Plan Date")
            load_plan.total_qty = incoming_qty

        load_plan.append("load_items", {
            "model": row.get("Model"),
            "model_name": row.get("Model Name"),
            "type": row.get("Type"),
            "variant": row.get("Variant"),
            "color": row.get("Color"),
            "group_color": row.get("Group Color"),
            "option": row.get("Option"),
            "quantity": incoming_qty
        })

        load_plan.status = "Planned"

        if load_plan.is_new():
            load_plan.insert(ignore_permissions=True)
        else:
            load_plan.save(ignore_permissions=True)

        if load_plan.docstatus == 0:
            load_plan.submit()

    frappe.db.commit()
    return "CSV uploaded and submitted successfully"

