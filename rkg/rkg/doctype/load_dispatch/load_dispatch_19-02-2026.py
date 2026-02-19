# -*- coding: utf-8 -*-

import frappe
import csv
import io
from frappe.model.document import Document
from frappe.utils import now_datetime, getdate, today,add_days


# =====================================================
# LOAD DISPATCH DOC
# =====================================================

class LoadDispatch(Document):

    # -------------------------------------------------
    # AUTONAME
    # -------------------------------------------------
    def autoname(self):
        dt = now_datetime()
        self.name = f"LD-{dt.strftime('%Y%m%d-%H%M%S')}"

    # -------------------------------------------------
    # VALIDATE
    # -------------------------------------------------
    def validate(self):

        if not self.items:
            frappe.throw("Load Dispatch Items cannot be empty")

        if (
            self.total_dispatch_quantity
            and self.total_load_quantity
            and self.total_dispatch_quantity > self.total_load_quantity
        ):
            frappe.throw(
                f"Dispatch Qty ({self.total_dispatch_quantity}) "
                f"cannot exceed Load Plan Qty ({self.total_load_quantity})"
            )

    # -------------------------------------------------
    # BEFORE SUBMIT
    # -------------------------------------------------
    def before_submit(self):

        total_receipt_qty = self.total_receipt_quantity or 0

        if self.warehouse and total_receipt_qty > 0:
            frappe.throw(
                "Warehouse is not allowed on Submit when Receipt Quantity exists.",
                title="Warehouse Validation"
            )

    # -------------------------------------------------
    # ON SUBMIT
    # -------------------------------------------------
    def on_submit(self):

        if self.linked_load_reference_no:
            frappe.db.set_value(
                "Load Plan",
                self.linked_load_reference_no,
                "status",
                "In-Transit"
            )

        self.db_set("status", "In-Transit")


# =====================================================
# CSV IMPORT (NO ROW SKIP VERSION)
# =====================================================

# @frappe.whitelist()
# def read_dispatch_csv(file_url, warehouse=None):

#     if not warehouse:
#         frappe.throw("Please select Warehouse before importing CSV")

#     EXPECTED_HEADERS = [
#         "HMSI Load Reference No",
#         "Invoice No",
#         "Dispatch Date",
#         "Model Variant",
#         "Model Name",
#         "Model Serial No",
#         "Frame No",
#         "Engine no",
#         "Colour",
#         "Tax Rate",
#         "DOR",
#         "HSN Code",
#         "Qty",
#         "Unit",
#         "Price/Unit",
#         "Key No",
#         "Battery No",
#     ]

#     file_doc = frappe.get_doc("File", {"file_url": file_url})
#     content = file_doc.get_content()

#     csv_data = io.StringIO(content)
#     reader = csv.reader(csv_data)
#     headers = [h.strip() for h in next(reader)]

#     if headers != EXPECTED_HEADERS:
#         frappe.throw("CSV Header mismatch")

#     csv_data.seek(0)
#     dict_reader = csv.DictReader(csv_data)
#     rows = list(dict_reader)

#     if not rows:
#         frappe.throw("CSV file is empty")

#     # -------------------------------------------------
#     # LOAD REFERENCE
#     # -------------------------------------------------
#     load_ref = rows[0]["HMSI Load Reference No"].strip()

#     # Check Load Dispatch duplicate
#     if frappe.db.exists("Load Dispatch", {"linked_load_reference_no": load_ref}):
#         frappe.throw(f"Load Dispatch already exists for Load Reference {load_ref}")

#     invoice_no = None
#     total_dispatch_qty = 0
#     items = []
#     duplicate_frames = []

#     # -------------------------------------------------
#     # PROCESS ROWS
#     # -------------------------------------------------
#     for row in rows:

#         frame_no = row["Frame No"].strip()
#         qty = int(float(row["Qty"]))

#         if qty <= 0:
#             continue

#         invoice_no = invoice_no or row["Invoice No"].strip()

#         # Duplicate check (DO NOT THROW)
#         if frappe.db.exists("Item", frame_no):
#             duplicate_frames.append(frame_no)
#             continue

#         total_dispatch_qty += qty

#         # Create Item Group if not exists
#         item_group = row["Model Name"].strip()

#         if not frappe.db.exists("Item Group", item_group):
#             frappe.get_doc({
#                 "doctype": "Item Group",
#                 "item_group_name": item_group,
#                 "parent_item_group": "All Item Groups",
#                 "is_group": 0
#             }).insert(ignore_permissions=True)

#         # Create Item
#         item = frappe.new_doc("Item")
#         item.item_code = frame_no
#         item.item_name = row["Model Variant"]
#         item.item_group = item_group
#         item.stock_uom = row["Unit"]
#         item.is_stock_item = 1
#         item.default_warehouse = warehouse

#         item.custom_item_type = "Two Wheeler"
#         item.custom_model_serial_name = row["Model Serial No"]
#         item.custom_engine_number = row["Engine no"]
#         item.custom_invoice_no = row["Invoice No"]
#         item.custom_dispatch_date = getdate(row["Dispatch Date"])
#         item.custom_color = row["Colour"]
#         item.custom_tax_rate = row["Tax Rate"]
#         item.custom_dor = getdate(row["DOR"])
#         item.gst_hsn_code = row["HSN Code"]
#         item.custom_hsn_code = row["HSN Code"]
#         item.end_of_life = add_days(today(), 1)
#         item.insert(ignore_permissions=True)

#         # Rate Calculation
#         price_unit = float(row["Price/Unit"])
#         tax_percent = float(row["Tax Rate"].replace("%", "").strip())
#         rate = round(price_unit + (price_unit * tax_percent / 100), 2)

#         # Append Child Row
#         items.append({
#             "hmsi_load_reference_no": load_ref,
#             "invoice_no": row["Invoice No"],
#             "dispatch_date": getdate(row["Dispatch Date"]),
#             "model_variant": row["Model Variant"],
#             "model_name": row["Model Name"],
#             "model_serial_no": row["Model Serial No"],
#             "frame_no": frame_no,
#             "engine_no": row["Engine no"],
#             "item_code": frame_no,
#             "color_code": row["Colour"],
#             "tax_rate": row["Tax Rate"],
#             "hsn_code": int(row["HSN Code"]),
#             "qty": qty,
#             "dor": getdate(row["DOR"]),
#             "price_unit": price_unit,
#             "key_no": "",
#             "unit": row["Unit"],
#             "rate": rate,
#         })

#     # -------------------------------------------------
#     # FINAL VALIDATIONS
#     # -------------------------------------------------

#     if total_dispatch_qty == 0:
#         frappe.throw("All Frame Numbers already exist. Nothing to import.")

#     load_plan = frappe.db.get_value(
#         "Load Plan",
#         {"load_reference_no": load_ref},
#         ["name", "total_qty", "status"],
#         as_dict=True
#     )

#     if not load_plan:
#         frappe.throw("Load Plan not found")

#     if load_plan.status != "Planned":
#         frappe.throw("Load Plan already used")

#     if total_dispatch_qty > load_plan.total_qty:
#         frappe.throw(
#             f"Dispatch Qty ({total_dispatch_qty}) cannot exceed "
#             f"Load Plan Qty ({load_plan.total_qty})"
#         )

#     # -------------------------------------------------
#     # SUCCESS RETURN
#     # -------------------------------------------------

#     warning = None
#     duplicate_count = len(duplicate_frames)

#     if duplicate_count > 0:
#         warning = {
#             "count": duplicate_count,
#             "frames": duplicate_frames
#         }


#     return {
#         "success": True,
#         "load_plan_name": load_plan.name,
#         "invoice_no": invoice_no,
#         "total_load_quantity": load_plan.total_qty,
#         "total_dispatch_quantity": total_dispatch_qty,
#         "items": items,
#         "duplicate_info": warning
#     }

@frappe.whitelist()
def read_dispatch_csv(file_url, warehouse=None):

    if not warehouse:
        frappe.throw("Please select Warehouse before importing CSV")

    EXPECTED_HEADERS = [
        "HMSI Load Reference No",
        "Invoice No",
        "Dispatch Date",
        "Model Variant",
        "Model Name",
        "Model Serial No",
        "Frame No",
        "Engine no",
        "Colour",
        "Tax Rate",
        "DOR",
        "HSN Code",
        "Qty",
        "Unit",
        "Price/Unit",
        "Key No",
        "Battery No",
    ]

    file_doc = frappe.get_doc("File", {"file_url": file_url})
    content = file_doc.get_content()

    csv_data = io.StringIO(content)
    reader = csv.reader(csv_data)
    headers = [h.strip() for h in next(reader)]

    if headers != EXPECTED_HEADERS:
        frappe.throw("CSV Header mismatch")

    csv_data.seek(0)
    dict_reader = csv.DictReader(csv_data)
    rows = list(dict_reader)

    if not rows:
        frappe.throw("CSV file is empty")

    load_ref = rows[0]["HMSI Load Reference No"].strip()

    if frappe.db.exists("Load Dispatch", {"linked_load_reference_no": load_ref}):
        frappe.throw(f"Load Dispatch already exists for Load Reference {load_ref}")

    invoice_no = None
    total_dispatch_qty = 0
    items = []
    duplicate_frames = []

    for row in rows:

        frame_no = row["Frame No"].strip()
        qty = int(float(row["Qty"]))

        if qty <= 0:
            continue

        invoice_no = invoice_no or row["Invoice No"].strip()

        if frappe.db.exists("Item", frame_no):
            duplicate_frames.append(frame_no)
            continue

        total_dispatch_qty += qty

        # Create Item Group if not exists
        item_group = row["Model Name"].strip()

        if not frappe.db.exists("Item Group", item_group):
            frappe.get_doc({
                "doctype": "Item Group",
                "item_group_name": item_group,
                "parent_item_group": "All Item Groups",
                "is_group": 0
            }).insert(ignore_permissions=True)

        # ---------------- CREATE ITEM ----------------
        item = frappe.new_doc("Item")
        item.item_code = frame_no
        item.item_name = row["Model Variant"]
        item.item_group = item_group
        item.stock_uom = row["Unit"]
        item.is_stock_item = 1
        item.default_warehouse = warehouse

        item.custom_item_type = "Two Wheeler"
        item.custom_model_serial_name = row["Model Serial No"]
        item.custom_engine_number = row["Engine no"]
        item.custom_invoice_no = row["Invoice No"]
        item.custom_dispatch_date = getdate(row["Dispatch Date"])
        item.custom_color = row["Colour"]
        item.custom_dor = getdate(row["DOR"])
        item.gst_hsn_code = row["HSN Code"]
        item.custom_hsn_code = row["HSN Code"]
        item.end_of_life = add_days(today(), 1)

        # ✅ TAX LINK
        tax_percent = float(row["Tax Rate"].replace("%", "").strip())

        template_name = frappe.db.sql("""
            SELECT name FROM `tabItem Tax Template`
            WHERE REPLACE(title, ' ', '') = %s
            LIMIT 1
        """, (f"GST{int(tax_percent)}%",), as_dict=1)

        if template_name:
            item.append("taxes", {
                "item_tax_template": template_name[0]["name"]
            })


        item.insert(ignore_permissions=True)


        # ---------------- RATE CALCULATION ----------------
        price_unit = float(row["Price/Unit"])
        rate = round(price_unit + (price_unit * tax_percent / 100), 2)

        items.append({
            "hmsi_load_reference_no": load_ref,
            "invoice_no": row["Invoice No"],
            "dispatch_date": getdate(row["Dispatch Date"]),
            "model_variant": row["Model Variant"],
            "model_name": row["Model Name"],
            "model_serial_no": row["Model Serial No"],
            "frame_no": frame_no,
            "engine_no": row["Engine no"],
            "item_code": frame_no,
            "color_code": row["Colour"],
            "tax_rate": row["Tax Rate"],
            "hsn_code": int(row["HSN Code"]),
            "qty": qty,
            "dor": getdate(row["DOR"]),
            "price_unit": price_unit,
            "key_no": "",
            "unit": row["Unit"],
            "rate": rate,
        })

    if total_dispatch_qty == 0:
        frappe.throw("All Frame Numbers already exist. Nothing to import.")

    load_plan = frappe.db.get_value(
        "Load Plan",
        {"load_reference_no": load_ref},
        ["name", "total_qty", "status"],
        as_dict=True
    )

    if not load_plan:
        frappe.throw("Load Plan not found")

    if load_plan.status != "Planned":
        frappe.throw("Load Plan already used")

    if total_dispatch_qty > load_plan.total_qty:
        frappe.throw(
            f"Dispatch Qty ({total_dispatch_qty}) cannot exceed "
            f"Load Plan Qty ({load_plan.total_qty})"
        )

    warning = None
    if duplicate_frames:
        warning = {
            "count": len(duplicate_frames),
            "frames": duplicate_frames
        }

    return {
        "success": True,
        "load_plan_name": load_plan.name,
        "invoice_no": invoice_no,
        "total_load_quantity": load_plan.total_qty,
        "total_dispatch_quantity": total_dispatch_qty,
        "items": items,
        "duplicate_info": warning
    }


@frappe.whitelist()
def create_purchase_receipt(load_dispatch):
    try:
        ld = frappe.get_doc("Load Dispatch", load_dispatch)

        # ------------------------------------------------
        # VALIDATIONS
        # ------------------------------------------------
        if ld.docstatus != 1:
            frappe.throw("Submit Load Dispatch before creating Purchase Receipt")

        if frappe.db.exists(
            "Purchase Receipt",
            {
                "custom_load_dispatch": ld.name,
                "docstatus": 1  # ✅ only submitted blocks
            }
        ):
            frappe.throw("Purchase Receipt already created for this Load Dispatch")


        supplier = frappe.db.get_value("RKG Settings", {}, "default_supplier")
        if not supplier:
            frappe.throw("Default Supplier not set in RKG Settings")

        if not ld.warehouse:
            frappe.throw("Warehouse not set in Load Dispatch")

        # ------------------------------------------------
        # CREATE PURCHASE RECEIPT
        # ------------------------------------------------
        pr = frappe.new_doc("Purchase Receipt")
        pr.supplier = supplier
        pr.posting_date = getdate()
        pr.set_warehouse = ld.warehouse
        pr.set_posting_time = 1
        # pr.company = 

        # Custom fields (safe)
        if pr.meta.has_field("custom_load_dispatch"):
            pr.custom_load_dispatch = ld.name

        if pr.meta.has_field("custom_load_reference"):
            pr.custom_load_reference = ld.linked_load_reference_no

        # 🔥 REQUIRED BY INDIA COMPLIANCE (GST)
        # Vendor Document Reference
        pr.supplier_delivery_note = ld.name

        # ------------------------------------------------
        # ITEMS
        # ------------------------------------------------
        for d in ld.items:
            pr.append("items", {
                "item_code": d.item_code,
                "qty": d.qty,
                "rate": d.rate,
                "warehouse": ld.warehouse
            })

        pr.insert(ignore_permissions=True)

        # ------------------------------------------------
        # UPDATE LOAD DISPATCH
        # ------------------------------------------------
        ld.db_set("total_receipt_quantity", 1)
        ld.db_set("status", "Received")

        # ------------------------------------------------
        # UPDATE LOAD PLAN
        # ------------------------------------------------
        if ld.linked_load_reference_no:
            frappe.db.set_value(
                "Load Plan",
                ld.linked_load_reference_no,
                "status",
                "Received"
            )

        return pr.name

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Create Purchase Receipt Failed"
        )
        frappe.throw(
            "Purchase Receipt creation failed. Please check Error Log."
        )


# =====================================================
# GET ITEMS
# =====================================================

@frappe.whitelist()
def get_items_from_load_dispatch(load_dispatch):

    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    if ld.docstatus != 1:
        frappe.throw("Load Dispatch must be Submitted")

    items = []

    for d in ld.items:
        items.append({
            "item_code": d.item_code,
            "qty": d.qty,
            "rate": d.rate,
            "warehouse": ld.warehouse
        })

    return {"items": items}
