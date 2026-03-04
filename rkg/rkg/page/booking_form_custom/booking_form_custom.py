import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_booking_list(status=None, customer=None, from_date=None, to_date=None):

    filters = {}

    if status and status != "All":
        filters["docstatus"] = int(status)

    if customer:
        filters["customer"] = ["like", f"%{customer}%"]

    if from_date and to_date:
        filters["creation"] = ["between", [from_date, to_date]]

    return frappe.get_all(
        "Booking Form",
        filters=filters,
        fields=[
            "name",
            "customer",
            "mobile",
            "final_amount",
            "docstatus"
        ],
        order_by="creation desc"
    )


@frappe.whitelist()
def get_booking_full_data(name):

    doc = frappe.get_doc("Booking Form", name)

    # Child totals
    nha_total = sum(flt(d.amount) for d in doc.table_kydz or [])
    hirise_total = sum(flt(d.amount) for d in doc.table_apcj or [])

    return {
        "main": {
            "name": doc.name,
            "customer": doc.customer,
            "mobile": doc.mobile,
            "item": doc.item,                
            "color_code": doc.color_code,    
            "payment_type": doc.payment_type,
            "price": doc.price,
            "amount": doc.amount,
            "road_total": doc.road_total,
            "nd_total": doc.nd_total,
            "road_tax_amount": doc.road_tax_amount,
            "ex_warranty_amount": doc.ex_warranty_amount,
            "hp_amount": doc.hp_amount,
            "down_payment_amount": doc.down_payment_amount,
            "finance_amount": doc.finance_amount,
            "discount_amount": doc.discount_amount,
            "discount_approved": doc.discount_approved,
            "final_amount": doc.final_amount,
        },
        "child_tables": {
            "nha_items": doc.table_kydz,
            "hirise_items": doc.table_apcj
        },
        "totals": {
            "nha_total": flt(nha_total, 2),
            "hirise_total": flt(hirise_total, 2)
        }
    }