import frappe
from frappe.model.document import Document
from frappe.utils import flt


class BookingForm(Document):

    # =====================================================
    # CHILD TABLE TOTALS
    # =====================================================

    def get_nha_total(self):
        return flt(sum(flt(row.amount) for row in self.table_kydz or []), 2)

    def get_hirise_total(self):
        return flt(sum(flt(row.amount) for row in self.table_apcj or []), 2)

    # =====================================================
    # COMMON CALCULATION
    # =====================================================

    def get_base_total(self):
        return flt(
            flt(self.amount)
            + flt(self.road_total)
            + flt(self.nd_total)
            + flt(self.ex_warranty_amount)
            + flt(self.road_tax_amount)
            + self.get_nha_total()
            + self.get_hirise_total(),
            2
        )

    def get_total_with_finance(self):
        base_total = self.get_base_total()

        if self.payment_type == "Finance":
            base_total += flt(self.hp_amount)

        return flt(base_total, 2)

    # =====================================================
    # VALIDATION
    # =====================================================

    def validate(self):

        # -----------------------------
        # Normalize all numeric fields
        # -----------------------------
        self.discount_amount = flt(self.discount_amount, 2)
        self.hp_amount = flt(self.hp_amount, 2)
        self.amount = flt(self.amount, 2)
        self.road_total = flt(self.road_total, 2)
        self.nd_total = flt(self.nd_total, 2)
        self.ex_warranty_amount = flt(self.ex_warranty_amount, 2)
        self.road_tax_amount = flt(self.road_tax_amount, 2)

        # -----------------------------
        # Recalculate full total
        # -----------------------------
        total = self.get_total_with_finance()

        # -----------------------------
        # Prevent negative discount
        # -----------------------------
        if self.discount_amount < 0:
            self.discount_amount = 0

        # -----------------------------
        # Discount validation
        # -----------------------------
        if self.discount_amount > 0:

            if not self.approver:
                frappe.throw("Approver is mandatory when discount is entered.")

            allowed_percent = frappe.db.get_value(
                "Discount Approval",
                {"approval_user": self.approver},
                "discount_percent"
            ) or 0

            allowed_percent = flt(allowed_percent)

            max_allowed = flt((total * allowed_percent) / 100, 2)

            if self.discount_amount > max_allowed:
                frappe.throw(
                    f"Discount exceeds allowed limit ({allowed_percent}%). "
                    f"Maximum allowed: ₹ {max_allowed}"
                )

        # -----------------------------
        # Prevent discount > total
        # -----------------------------
        if self.discount_amount > total:
            self.discount_amount = total

        # -----------------------------
        # Final amount calculation
        # -----------------------------
        # Apply discount ONLY if approved
        if self.discount_amount > 0 and self.discount_approved == "Approved":
            calculated_final = flt(total - self.discount_amount, 2)
        else:
            calculated_final = flt(total, 2)

        if calculated_final < 0:
            calculated_final = 0

        # Only update if changed (important)
        if abs(flt(self.final_amount) - calculated_final) > 0.01:
            self.final_amount = calculated_final

    # =====================================================
    # SUBMIT
    # =====================================================

    def on_submit(self):
        if not self.discount_approved:
            self.discount_approved = "Pending"

    # =====================================================
    # EDIT AFTER SUBMIT CONTROL
    # =====================================================

    def before_update_after_submit(self):

        # Allow cancel freely
        if self.docstatus == 2:
            return

        db_doc = frappe.get_doc(self.doctype, self.name)

        locked_fields = [
            "finance_amount",
            "down_payment_amount",
            "hp_amount",
            "payment_type",
            "amount",
            "road_total",
            "nd_total",
            "ex_warranty_amount",
            "road_tax_amount"
        ]

        for field in locked_fields:
            if abs(flt(getattr(self, field)) - flt(getattr(db_doc, field))) > 0.01:
                frappe.throw(
                    f"Not allowed to change {field.replace('_', ' ').title()} after submission"
                )

        # Discount modification rule
        if db_doc.discount_approved != "Pending":
            if abs(flt(self.discount_amount) - flt(db_doc.discount_amount)) > 0.01:
                frappe.throw("Cannot modify discount after decision taken")

        # Prevent manual final amount tampering
        decision_changed = self.discount_approved != db_doc.discount_approved

        if not decision_changed:
            if abs(flt(self.final_amount) - flt(db_doc.final_amount)) > 0.01:
                frappe.throw("Final Amount cannot be modified manually after submission")


# =========================================================
# APPROVAL API
# =========================================================

@frappe.whitelist()
def update_discount_decision(docname, decision):

    if decision not in ["Approved", "Reject"]:
        frappe.throw("Invalid decision")

    doc = frappe.get_doc("Booking Form", docname)

    if doc.docstatus != 1:
        frappe.throw("Document must be submitted first")

    if doc.approver != frappe.session.user:
        frappe.throw("You are not authorized approver")

    if doc.discount_approved in ["Approved", "Reject"]:
        frappe.throw("Decision already taken")

    total = doc.get_total_with_finance()

    if decision == "Approved":

        doc.discount_approved = "Approved"
        doc.final_amount = flt(total - doc.discount_amount, 2)

    else:  # Reject

        doc.discount_approved = "Reject"
        doc.discount_amount = 0
        doc.final_amount = flt(total, 2)

    doc.save(ignore_permissions=True)

    return "OK"