frappe.pages['booking-form-custom'].on_page_load = function (wrapper) {

    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Booking Dashboard',
        single_column: true
    });

    // --------------------------
    // PAGE LAYOUT
    // --------------------------

    let html = `
		<style>
			.dashboard-container { padding:20px 24px; }
		</style>	
        <div class="booking-dashboard dashboard-container">

            <!-- FILTER ROW -->
            <div class="row" style="margin-bottom:20px;">

                <div class="col-md-2">
                    <label>Status</label>
                    <select id="status_filter" class="form-control">
                        <option value="All">All Statuses</option>
                        <option value="0">Draft</option>
                        <option value="1">Submitted</option>
                        <option value="2">Cancelled</option>
                    </select>
                </div>

                <div class="col-md-2">
                    <label>Customer</label>
                    <input type="text" id="customer_filter" class="form-control">
                </div>

                <div class="col-md-2">
                    <label>From Date</label>
                    <input type="date" id="from_date" class="form-control">
                </div>

                <div class="col-md-2">
                    <label>To Date</label>
                    <input type="date" id="to_date" class="form-control">
                </div>

                <div class="col-md-2" style="margin-top:25px;">
                    <button class="btn btn-secondary" id="reset_btn">Reset</button>
                </div>

            </div>

            <!-- COUNT CARDS -->
            <div class="row" style="margin-bottom:25px;">

                <div class="col-md-4">
                    <div class="dashboard-card">
                        <div class="card-title">Total Bookings</div>
                        <div class="card-value" id="total_bookings">0</div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="dashboard-card">
                        <div class="card-title">Submitted</div>
                        <div class="card-value" id="submitted_count">0</div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="dashboard-card">
                        <div class="card-title">Cancelled</div>
                        <div class="card-value" id="cancelled_count">0</div>
                    </div>
                </div>

            </div>

            <!-- TABLE -->
            <div id="booking-table"></div>

        </div>
    `;

    $(page.body).html(html);

    add_styles();
    load_data();

    // --------------------------
    // EVENTS
    // --------------------------

    $("#status_filter, #customer_filter, #from_date, #to_date")
        .on("change keyup", function () {
            load_data();
        });

    $("#reset_btn").on("click", function () {
        $("#status_filter").val("All");
        $("#customer_filter").val("");
        $("#from_date").val("");
        $("#to_date").val("");
        load_data();
    });


    // --------------------------
    // LOAD DATA
    // --------------------------

    function load_data() {

        frappe.call({
            method: "rkg.rkg.page.booking_form_custom.booking_form_custom.get_booking_list",
            args: {
                status: $("#status_filter").val(),
                customer: $("#customer_filter").val(),
                from_date: $("#from_date").val(),
                to_date: $("#to_date").val()
            },
            callback: function (r) {

                let data = r.message || [];

                // UPDATE CARDS
                $("#total_bookings").text(data.length);
                $("#submitted_count").text(
                    data.filter(d => d.docstatus == 1).length
                );
                $("#cancelled_count").text(
                    data.filter(d => d.docstatus == 2).length
                );

                // TABLE
                let table = `
                    <table class="table table-bordered">
                        <thead>
                            <tr>
                                <th>Booking ID</th>
                                <th>Customer</th>
                                <th>Mobile</th>
                                <th>Final Amount</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                data.forEach(row => {

                    let status =
                        row.docstatus == 0 ? "Draft" :
                        row.docstatus == 1 ? "Submitted" : "Cancelled";

                    table += `
                        <tr>
                            <td>${row.name}</td>
                            <td>${row.customer || ""}</td>
                            <td>${row.mobile || ""}</td>
                            <td>${format_currency(row.final_amount)}</td>
                            <td>${status}</td>
                            <td>
                                <button class="btn btn-sm btn-primary view-btn"
                                    data-name="${row.name}">
                                    View
                                </button>
                            </td>
                        </tr>
                    `;
                });

                table += "</tbody></table>";

                $("#booking-table").html(table);
            }
        });
    }


    // --------------------------
    // STYLES (Blue Border Card)
    // --------------------------

    function add_styles() {

        $("<style>")
            .prop("type", "text/css")
            .html(`
                .dashboard-card {
                    background: #fff;
                    border-radius: 10px;
                    padding: 20px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
                    border-left: 5px solid #3b82f6;
                }

                .card-title {
                    font-size: 14px;
                    color: #6b7280;
                }

                .card-value {
                    font-size: 28px;
                    font-weight: 600;
                    margin-top: 5px;
                }
            `)
            .appendTo("head");
    }

	// --------------------------
	// VIEW BUTTON POPUP
	// --------------------------

	$(document).on("click", ".view-btn", function () {

		let name = $(this).data("name");

		frappe.call({
			method: "rkg.rkg.page.booking_form_custom.booking_form_custom.get_booking_full_data",
			args: { name: name },
			callback: function (r) {

				if (!r.message) {
					frappe.msgprint("No data found");
					return;
				}

				let doc = r.message.main;
				let totals = r.message.totals;

				let dialog = new frappe.ui.Dialog({
					title: "Booking: " + doc.name,
					size: "large",
					fields: [
						{
							fieldtype: "HTML",
							fieldname: "details"
						}
					]
				});

				dialog.fields_dict.details.$wrapper.html(`

				<div style="padding:15px">

					<!-- CUSTOMER CARD -->
					<div style="
						background:#f8fafc;
						padding:15px;
						border-radius:8px;
						margin-bottom:15px;
						border-left:4px solid #3b82f6;
					">
						<h5 style="margin-bottom:10px;">Customer Information</h5>
						<div class="row">
							<div class="col-md-6">
								<b>Customer:</b><br>
								${doc.customer || ""}
							</div>
							<div class="col-md-6">
								<b>Mobile:</b><br>
								${doc.mobile || ""}
							</div>
						</div>
					</div>

					<!-- AMOUNT BREAKDOWN -->
					<div style="
						background:#ffffff;
						padding:15px;
						border-radius:8px;
						margin-bottom:15px;
						box-shadow:0 2px 6px rgba(0,0,0,0.05);
					">
						<h5 style="margin-bottom:15px;">Amount Breakdown</h5>

						<div class="row">
							<div class="col-md-6">
								<p>Vehicle: ${format_currency(doc.amount)}</p>
								<p>Registration: ${format_currency(doc.road_total)}</p>
								<p>Insurance: ${format_currency(doc.nd_total)}</p>
								<p>Road Tax: ${format_currency(doc.road_tax_amount)}</p>
							</div>
							<div class="col-md-6">
								<p>Accessories: ${format_currency(totals.nha_total)}</p>
								<p>HIRISE: ${format_currency(totals.hirise_total)}</p>
								<p>Extended Warranty: ${format_currency(doc.ex_warranty_amount)}</p>
								<p>Discount: ${format_currency(doc.discount_amount)}</p>
							</div>
						</div>
					</div>

					<!-- PAYMENT SECTION -->
					<div style="
						background:#ffffff;
						padding:15px;
						border-radius:8px;
						margin-bottom:15px;
						box-shadow:0 2px 6px rgba(0,0,0,0.05);
					">
						<h5 style="margin-bottom:15px;">Payment Details</h5>

						<div class="row">
							<div class="col-md-4">
								<b>Payment Type</b><br>
								${doc.payment_type || ""}
							</div>
							<div class="col-md-4">
								<b>Down Payment</b><br>
								${format_currency(doc.down_payment_amount)}
							</div>
							<div class="col-md-4">
								<b>Finance Amount</b><br>
								${format_currency(doc.finance_amount)}
							</div>
						</div>

						<div class="row" style="margin-top:10px;">
							<div class="col-md-4">
								<b>HP Amount</b><br>
								${format_currency(doc.hp_amount)}
							</div>
						</div>
					</div>

					<!-- FINAL AMOUNT HIGHLIGHT -->
					<div style="
						background:#ecfdf5;
						padding:20px;
						border-radius:10px;
						text-align:center;
						border:2px solid #10b981;
					">
						<h4 style="margin:0; color:#059669;">
							Final Amount: ${format_currency(doc.final_amount)}
						</h4>
					</div>

				</div>

				`);

				dialog.show();
			}
		});

	});
};