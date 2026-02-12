import frappe
from frappe.utils import cint


def update_billed_invoice_count(doc, method):

    load_dispatches = set()

    # Collect related Load Dispatch from Purchase Receipts
    for item in doc.items:
        if not item.purchase_receipt:
            continue

        ld = frappe.db.get_value(
            "Purchase Receipt",
            item.purchase_receipt,
            "custom_load_dispatch"
        )

        if ld:
            load_dispatches.add(ld)

    if not load_dispatches:
        return

    for ld in load_dispatches:

        # Count submitted Purchase Invoices
        billed_count = frappe.db.sql(
            """
            SELECT COUNT(DISTINCT pi.name)
            FROM `tabPurchase Invoice` pi
            INNER JOIN `tabPurchase Invoice Item` pii
                ON pii.parent = pi.name
            INNER JOIN `tabPurchase Receipt` pr
                ON pr.name = pii.purchase_receipt
            WHERE
                pi.docstatus = 1
                AND pr.custom_load_dispatch = %s
            """,
            (ld,)
        )[0][0] or 0

        # Update billed count
        frappe.db.set_value(
            "Load Dispatch",
            ld,
            "total_billed_quantity",
            cint(billed_count)
        )

        # Get receipt qty
        total_receipt_qty = frappe.db.get_value(
            "Load Dispatch",
            ld,
            "total_receipt_quantity"
        ) or 0

        # Update status logic
        if billed_count == 0:
            status = "Received"
        elif billed_count < total_receipt_qty:
            status = "Partially Billed"
        else:
            status = "Fully Billed"

        frappe.db.set_value(
            "Load Dispatch",
            ld,
            "status",
            status
        )
