frappe.pages['battery-ageing-dashb'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Battery Ageing Dashboard',
		single_column: true
	});
}