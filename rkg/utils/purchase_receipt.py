import frappe


def on_cancel_purchase_receipt(doc, method=None):
    """
    Reset Load Dispatch when Purchase Receipt is cancelled
    """

    if not doc.custom_load_dispatch:
        return

    ld = frappe.get_doc("Load Dispatch", doc.custom_load_dispatch)

    # Reset receipt qty
    ld.db_set("total_receipt_quantity", 0)

    # Reset Load Dispatch status
    ld.db_set("status", "In-Transit")

    # Reset Load Plan status
    if ld.linked_load_reference_no:
        frappe.db.set_value(
            "Load Plan",
            ld.linked_load_reference_no,
            "status",
            "In-Transit"
        )
