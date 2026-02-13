# Copyright (c) 2026
# License: see license.txt

import frappe
import csv
import io
import re
from frappe.model.document import Document
from frappe.utils import nowdate, today, add_years
from openpyxl import load_workbook
from datetime import datetime


EXPECTED_HEADERS = [
    "Battery Brand",
    "Batery Type",
    "Sample Battery Serial No",
    "Sample Battery Charging Date",
    "Charging Date",
    "Frame No",
    "Key No",
]


class BatteryandKeyUpload(Document):

    # =====================================================
    # AUTO PROCESS AFTER SAVE
    # =====================================================
    def on_update(self):
        if not self.excel_file:
            return

        if getattr(self, "has_processed", 0):
            return

        self.process_file()

    # =====================================================
    # MAIN PROCESS
    # =====================================================
    def process_file(self):

        file_doc = frappe.get_doc("File", {"file_url": self.excel_file})
        file_name = file_doc.file_name.lower()

        if file_name.endswith(".csv"):
            headers, rows = self.read_csv(file_doc)
        elif file_name.endswith(".xlsx"):
            headers, rows = self.read_excel(file_doc)
        else:
            frappe.throw("Only CSV or Excel (.xlsx) allowed")

        self.validate_headers(headers)
        self.insert_rows(rows)

    # =====================================================
    # CSV READER
    # =====================================================
    def read_csv(self, file_doc):
        content = file_doc.get_content()
        reader = csv.reader(io.StringIO(content))

        raw_headers = next(reader)
        headers = [str(h).strip() for h in raw_headers]

        rows = []
        for row in reader:
            cleaned = [str(v).strip() if v else "" for v in row]
            rows.append(dict(zip(headers, cleaned)))

        return headers, rows

    # =====================================================
    # EXCEL READER
    # =====================================================
    def read_excel(self, file_doc):
        wb = load_workbook(file_doc.get_full_path(), data_only=True)
        ws = wb.active

        headers = [str(c.value).strip() if c.value else "" for c in ws[1]]

        rows = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            row_dict = {}
            for i, value in enumerate(row):
                row_dict[headers[i]] = str(value).strip() if value else ""
            rows.append(row_dict)

        return headers, rows

    # =====================================================
    # HEADER VALIDATION
    # =====================================================
    def validate_headers(self, headers):

        if [h.strip() for h in headers] != EXPECTED_HEADERS:
            frappe.throw(
                f"""❌ Header Format Incorrect

Expected:
{EXPECTED_HEADERS}

Found:
{headers}
"""
            )

    # =====================================================
    # INSERT ROWS (NO ITEM INSERT)
    # =====================================================
    def insert_rows(self, rows):

        self.set("upload_items", [])
        error_rows = []
        inserted = 0

        for idx, row in enumerate(rows, start=2):

            errors = []

            # -------------------------
            # ULTRA CLEAN VALUES
            # -------------------------
            def clean(val):
                return re.sub(r"[^A-Za-z0-9]", "", str(val or ""))

            frame_no = clean(row.get("Frame No"))
            battery_serial = clean(row.get("Sample Battery Serial No"))
            key_no = clean(row.get("Key No"))

            if not frame_no:
                errors.append("Frame No missing")

            if not battery_serial:
                errors.append("Battery Serial No missing")

            # -------------------------
            # FETCH EXISTING ITEM ONLY
            # -------------------------
            item_name = None

            if frame_no:
                item_name = frappe.db.get_value(
                    "Item",
                    {"name": frame_no},
                    "name"
                )

                if not item_name:
                    item_name = frappe.db.get_value(
                        "Item",
                        {"item_code": frame_no},
                        "name"
                    )

                if not item_name:
                    errors.append(
                        f"Frame No '{frame_no}' not found in Item master"
                    )

            charging_date = self.parse_date(
                row.get("Charging Date", ""),
                "Charging Date",
                errors
            )

            battery_charging_date = row.get(
                "Sample Battery Charging Date", ""
            )

            if errors:
                error_rows.append(f"Row {idx}: " + "; ".join(errors))
                continue

            # -------------------------
            # APPEND CHILD ROW
            # -------------------------
            self.append("upload_items", {
                "frame_no": frame_no,
                "item_code": item_name,
                "battery_brand": row.get("Battery Brand", "").strip(),
                "battery_type": row.get("Batery Type", "").strip(),
                "battery_serial_no": battery_serial,
                "battery_charging_date": battery_charging_date,
                "charging_date": charging_date,
                "key_no": key_no,
            })

            # -------------------------
            # UPDATE ITEM END OF LIFE
            # -------------------------
            frappe.db.set_value(
                "Item",
                item_name,
                "end_of_life",
                add_years(today(), 5)
            )

            inserted += 1

        if error_rows:
            frappe.throw(
                "❌ Validation Failed\n\n" +
                "\n".join(error_rows)
            )

        self.date = nowdate()
        self.has_processed = 1

        frappe.msgprint(
            f"✅ Upload Successful\nInserted Rows: {inserted}",
            indicator="green",
            alert=True
        )

    # =====================================================
    # DATE PARSER
    # =====================================================
    def parse_date(self, value, label, errors):

        if not value:
            return None

        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(value.strip(), fmt).date()
            except Exception:
                pass

        errors.append(f"Invalid {label}")
        return None


# =====================================================
# MANUAL BUTTON
# =====================================================
@frappe.whitelist()
def process_battery_key_upload(name):
    doc = frappe.get_doc("Battery and Key Upload", name)
    doc.process_file()
    return "Processed Successfully"
