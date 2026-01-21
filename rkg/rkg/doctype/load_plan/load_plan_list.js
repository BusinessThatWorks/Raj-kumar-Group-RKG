frappe.listview_settings["Load Plan"] = {
    onload(listview) {
        listview.page.add_inner_button("Upload CSV", () => {
            frappe.set_route("Form", "Upload Load Plan", "new-upload-load-plan");
        });
    }
};
