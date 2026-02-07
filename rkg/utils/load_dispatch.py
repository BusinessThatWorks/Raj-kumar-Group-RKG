import frappe
from frappe.utils import cint


def update_billed_invoice_count(doc, method):
    """
    ONE Load Dispatch = COUNT of DISTINCT submitted Purchase Invoices
    (Document-based billing, NOT item qty)
    """

    load_dispatches = set()

    # -----------------------------------------
    # Collect Load Dispatch from PI → PR links
    # -----------------------------------------
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

    # -----------------------------------------
    # Recalculate billed invoice count per LD
    # -----------------------------------------
    for ld in load_dispatches:

        billed_invoice_count = frappe.db.sql(
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

        # -----------------------------------------
        # Update Load Dispatch
        # -----------------------------------------
        frappe.db.set_value(
            "Load Dispatch",
            ld,
            "total_billed_quantity",
            cint(billed_invoice_count)
        )


