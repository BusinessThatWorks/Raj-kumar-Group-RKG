from frappe import _

def get_data():
    return {
        "fieldname": "linked_load_reference_no",
        "transactions": [
            {
                "label": _("Load Dispatch"),
                "items": [
                    "Load Dispatch"
                ],
            }
        ],
    }
