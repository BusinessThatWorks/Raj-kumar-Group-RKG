frappe.pages["load-plan-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Load Plan & Load Dispatch Dashboard",
		single_column: true
	});

	page.dashboard = new LoadPlanDashboard(page);
};

class LoadPlanDashboard {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.current_tab = "load-plan";
		this.allPlans = [];
		this.allDispatches = [];
		this.init();
	}

	// ================= INIT =================
	init() {
		this.render_layout();
		this.bind_events();
		this.load_filter_options();
		this.refresh();
	}

	// ================= UI =================
	render_layout() {
		this.wrapper.html(`
			<style>
				.dashboard-container { padding:20px 24px; }

				.dashboard-tabs {
					display:flex; gap:8px; margin-bottom:16px;
					border-bottom:2px solid #e0e0e0;
				}
				.tab-btn {
					padding:10px 20px; cursor:pointer;
					border:none; background:none; font-weight:600;
				}
				.tab-btn.active {
					color:#007bff;
					border-bottom:3px solid #007bff;
				}

				.filters-grid {
					display:flex; gap:15px; flex-wrap:wrap;
					margin-bottom:20px;
				}
				.filter-group {
					display:flex; flex-direction:column;
					min-width:180px;
				}
				.reset-btn { margin-top:22px; height:36px; }

				/* ===== SUMMARY CARDS ===== */
				.summary-cards {
					display:grid;
					grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
					gap:16px;
					margin-bottom:20px;
				}
				.summary-card {
					background:#ffffff;
					border-radius:10px;
					padding:16px;
					box-shadow:0 2px 6px rgba(0,0,0,0.08);
					border-left:5px solid #007bff;
				}
				.summary-card h6 {
					margin:0;
					font-size:13px;
					color:#6c757d;
				}
				.summary-card h3 {
					margin-top:6px;
					font-size:24px;
					font-weight:700;
					color:#212529;
				}

				table {
					width:100%;
					border-collapse:collapse;
				}
				th, td {
					padding:10px;
					border-bottom:1px solid #ddd;
				}
				th { background:#f7f7f7; }

				.progress-bar {
					height:10px;
					background:#eee;
					border-radius:5px;
				}
				.progress-fill {
					height:100%;
					background:#007bff;
					border-radius:5px;
				}
			</style>

			<div class="dashboard-container">

				<div class="dashboard-tabs">
					<button class="tab-btn active" data-tab="load-plan">Load Plan</button>
					<button class="tab-btn" data-tab="load-dispatch">Load Dispatch</button>
				</div>

				<div class="filters-grid">
					<div class="filter-group">
						<label>Status</label>
						<select class="form-control filter-status"></select>
					</div>
					<div class="filter-group">
						<label>Load Reference</label>
						<select class="form-control filter-load-ref"></select>
					</div>
					<div class="filter-group">
						<label>From Date</label>
						<input type="date" class="form-control filter-from-date">
					</div>
					<div class="filter-group">
						<label>To Date</label>
						<input type="date" class="form-control filter-to-date">
					</div>
					<div class="filter-group">
						<button class="btn btn-secondary reset-btn">Reset</button>
					</div>
				</div>

				<!-- LOAD PLAN -->
				<div id="load-plan-content">
					<div class="summary-cards">
						<div class="summary-card">
							<h6>Total Load Plans</h6>
							<h3 id="total-plans">0</h3>
						</div>
						<div class="summary-card">
							<h6>Total Dispatches</h6>
							<h3 id="total-submitted-dispatches">0</h3>
						</div>
						<div class="summary-card">
							<h6>Total Dispatch Qty</h6>
							<h3 id="total-dispatch-qty-sum">0</h3>
						</div>
					</div>

					<div id="plan-table-container"></div>
				</div>

				<!-- LOAD DISPATCH -->
				<div id="load-dispatch-content" style="display:none;">
					<div class="summary-cards">
						<div class="summary-card">
							<h6>Total Dispatches</h6>
							<h3 id="total-dispatches">0</h3>
						</div>
						<div class="summary-card">
							<h6>Total Dispatch Qty</h6>
							<h3 id="total-dispatch-qty">0</h3>
						</div>
						<div class="summary-card">
							<h6>Total Received Qty</h6>
							<h3 id="total-received-qty">0</h3>
						</div>
						<div class="summary-card">
							<h6>Total Billed Qty</h6>
							<h3 id="total-billed-qty">0</h3>
						</div>
					</div>

					<div id="dispatch-table-container"></div>
				</div>
			</div>
		`);
	}

	// ================= EVENTS =================
	bind_events() {
		this.wrapper.find(".tab-btn").on("click", (e) => {
			this.switch_tab($(e.currentTarget).data("tab"));
		});

		this.wrapper
			.find(".filter-status,.filter-load-ref,.filter-from-date,.filter-to-date")
			.on("change", () => this.refresh());

		this.wrapper.find(".reset-btn").on("click", () => this.reset_filters());
	}

	switch_tab(tab) {
		this.current_tab = tab;

		this.wrapper.find(".tab-btn").removeClass("active");
		this.wrapper.find(`[data-tab="${tab}"]`).addClass("active");

		this.wrapper.find("#load-plan-content,#load-dispatch-content").hide();
		this.wrapper.find(tab === "load-plan" ? "#load-plan-content" : "#load-dispatch-content").show();

		this.load_filter_options();
		this.refresh();
	}

	// ================= FILTERS =================
	reset_filters() {
		this.wrapper.find("select,input").val("");
		this.refresh();
	}

	get_filters() {
		return {
			doctype: this.current_tab === "load-plan" ? "Load Plan" : "Load Dispatch",
			status: this.get_value(".filter-status"),
			load_reference: this.get_value(".filter-load-ref"),
			from_date: this.get_value(".filter-from-date"),
			to_date: this.get_value(".filter-to-date")
		};
	}

	get_value(selector) {
		return this.wrapper.find(selector).val() || null;
	}

	load_filter_options() {
		frappe.call({
			method: "rkg.rkg.page.load_plan_dashboard.load_plan_dashboard.get_filter_options",
			args: { doctype: this.get_filters().doctype },
			callback: (r) => {
				if (!r.message) return;
				this.fill_dropdown(".filter-status", r.message.statuses, "All Statuses");
				this.fill_dropdown(".filter-load-ref", r.message.load_references, "All References");
			}
		});
	}

	fill_dropdown(selector, values, label) {
		const el = this.wrapper.find(selector);
		el.empty().append(`<option value="">${label}</option>`);
		values.forEach(v => el.append(`<option value="${v}">${v}</option>`));
	}

	// ================= DATA =================
	refresh() {
		frappe.call({
			method: "rkg.rkg.page.load_plan_dashboard.load_plan_dashboard.get_dashboard_data",
			args: this.get_filters(),
			callback: (r) => {
				if (!r.message) return;

				if (this.current_tab === "load-plan") {
					this.allPlans = r.message.plans || [];
					this.render_plan_summary(r.message.summary);
					this.renderPlansTable();
				} else {
					this.allDispatches = r.message.dispatches || [];
					this.render_dispatch_summary(r.message.summary);
					this.renderDispatchesTable();
				}
			}
		});
	}

	// ================= SUMMARY =================
	render_plan_summary(summary) {
		$("#total-plans").text(summary.total_plans || 0);
		$("#total-submitted-dispatches").text(summary.total_submitted_dispatches || 0);
		$("#total-dispatch-qty-sum").text(summary.total_dispatch_qty_sum || 0);
	}

	render_dispatch_summary(summary) {
		$("#total-dispatches").text(summary.total_dispatches || 0);
		$("#total-dispatch-qty").text(summary.total_dispatch_qty || 0);
		$("#total-received-qty").text(summary.total_receipt_quantity || 0);
		$("#total-billed-qty").text(summary.total_billed_qty || 0);
	}

	// ================= TABLES =================
	renderPlansTable() {
		const c = $("#plan-table-container").empty();
		if (!this.allPlans.length) return c.html("<p>No Load Plans found.</p>");

		let html = `<table>
			<tr>
				<th>Load Reference</th>
				<th>Status</th>
				<th>Total Qty</th>
				<th>Dispatched Qty</th>
				<th>Progress</th>
			</tr>`;

		this.allPlans.forEach(p => {
			html += `
			<tr>
				<td>${p.load_reference_no}</td>
				<td>${p.status}</td>
				<td>${p.total_quantity}</td>
				<td>${p.load_dispatch_quantity}</td>
				<td>
					<div class="progress-bar">
						<div class="progress-fill" style="width:${p.progress || 0}%"></div>
					</div>
				</td>
			</tr>`;
		});

		c.html(html + "</table>");
	}

	renderDispatchesTable() {
		const c = $("#dispatch-table-container").empty();
		if (!this.allDispatches.length) return c.html("<p>No Dispatches found.</p>");

		let html = `<table>
			<tr>
				<th>Dispatch No</th>
				<th>Load Reference</th>
				<th>Status</th>
				<th>Dispatch Qty</th>
				<th>Received Qty</th>
				<th>Billed Qty</th>
			</tr>`;

		this.allDispatches.forEach(d => {
			html += `
			<tr>
				<td>${d.dispatch_no}</td>
				<td>${d.linked_load_reference_no}</td>
				<td>${d.status}</td>
				<td>${d.total_dispatch_quantity}</td>
				<td>${d.total_receipt_quantity}</td>
				<td>${d.total_billed_quantity}</td>
			</tr>`;
		});

		c.html(html + "</table>");
	}
}
