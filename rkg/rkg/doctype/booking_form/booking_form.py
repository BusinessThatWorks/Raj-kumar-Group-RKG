import frappe
from frappe.model.document import Document
from frappe.utils import flt


class BookingForm(Document):

    # ================= VALIDATION =================

    def validate(self):

        self.final_amount = flt(self.final_amount, 2)
        self.discount_amount = flt(self.discount_amount, 2)

        # If discount entered
        if self.discount_amount > 0:

            if not self.approver:
                frappe.throw("Approver is mandatory when discount is entered.")

            # 🔒 Check if approver exists in Discount Approval doctype
            approval = frappe.db.get_value(
                "Discount Approval",
                {"approval_user": self.approver},
                ["discount_percent"],
                as_dict=True
            )

            if not approval:
                frappe.throw("Selected approver is not authorized for discount approval.")

            # 🔒 Validate discount limit based on approver
            base_total = (
                (self.amount or 0) +
                (self.road_total or 0) +
                (self.nd_total or 0) +
                (self.ex_warranty_amount or 0)
            )

            hp = self.hp_amount or 0
            gross_total = base_total + hp

            max_allowed = (gross_total * approval.discount_percent) / 100

            if self.discount_amount > max_allowed:
                frappe.throw(
                    f"Discount exceeds allowed limit ({approval.discount_percent}%). "
                    f"Maximum allowed: {round(max_allowed, 2)}"
                )

    # ================= SUBMIT =================

    def on_submit(self):
        
        # Initialize workflow state
        if not self.discount_approved:
            self.discount_approved = "Pending"

    # ================= EDIT AFTER SUBMIT CONTROL =================

    def before_update_after_submit(self):

        db_doc = frappe.get_doc(self.doctype, self.name)

        # 🔒 1️⃣ Lock Financial Base Structure
        locked_fields = [
            "finance_amount",
            "down_payment_amount",
            "hp_amount",
            "payment_type"
        ]

        for field in locked_fields:
            if round(flt(getattr(self, field)), 2) != round(flt(getattr(db_doc, field)), 2):
                frappe.throw(
                    f"Not allowed to change {field.replace('_', ' ').title()} after submission"
                )

        # 🔒 2️⃣ Discount Editable Only If Pending
        if db_doc.discount_approved != "Pending":
            if flt(self.discount_amount) != flt(db_doc.discount_amount):
                frappe.throw("Cannot modify discount after decision taken")

        # 🔒 3️⃣ Allow final_amount change only if caused by discount decision
        if (
            flt(self.final_amount) != flt(db_doc.final_amount)
            and db_doc.discount_approved not in ["Pending"]
        ):
            frappe.throw("Final Amount cannot be modified manually after submission")


# ================= APPROVAL API =================

@frappe.whitelist()
def update_discount_decision(docname, decision):

    doc = frappe.get_doc("Booking Form", docname)

    if doc.docstatus != 1:
        frappe.throw("Document must be submitted first")

    if doc.approver != frappe.session.user:
        frappe.throw("You are not authorized approver")

    if doc.discount_approved in ["Approved", "Reject"]:
        frappe.throw("Decision already taken")

    if decision == "Approved":
        doc.discount_approved = "Approved"

    elif decision == "Reject":
        doc.discount_approved = "Reject"
        doc.discount_amount = 0

    # 🔥 Recalculate final amount after decision
    base_total = (
        (doc.amount or 0) +
        (doc.road_total or 0) +
        (doc.nd_total or 0) +
        (doc.ex_warranty_amount or 0)
    )

    hp = doc.hp_amount or 0
    discount = doc.discount_amount or 0

    doc.final_amount = base_total + hp - discount

    doc.save(ignore_permissions=True)

    return "OK"