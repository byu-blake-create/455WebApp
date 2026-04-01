import { createContext, useContext, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { api, ApiError } from "./api.js";
import { formatCurrency, formatDateTime } from "./format.js";

const AppContext = createContext(null);

function useApp() {
  return useContext(AppContext);
}

function Shell() {
  const { customer, customerLoading, refreshCustomer } = useApp();
  const navigate = useNavigate();
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  async function clearCustomer() {
    await api("/clear-customer", { method: "POST", body: JSON.stringify({}) });
    await refreshCustomer();
    navigate("/select-customer");
  }

  function handleProtectedNavClick(event) {
    if (customerLoading || customer) {
      return;
    }

    event.preventDefault();
    setToastMessage("Select a customer first");
  }

  const protectedNavClassName = ({ isActive }) =>
    customer
      ? isActive
        ? "nav-link active"
        : "nav-link"
      : "nav-link nav-link-disabled";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Operational Data + Scoring</p>
          <h1>Shop ML Pipeline Demo</h1>
          <p className="subtitle">
            Clean Vite frontend on top of Vercel-compatible API routes that read and write
            to Supabase.
          </p>
        </div>

        <nav className="nav">
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            to="/select-customer"
          >
            Select Customer
          </NavLink>
          <NavLink className={protectedNavClassName} onClick={handleProtectedNavClick} to="/dashboard">
            Customer Dashboard
          </NavLink>
          <NavLink
            className={protectedNavClassName}
            onClick={handleProtectedNavClick}
            to="/place-order"
          >
            Place Order
          </NavLink>
          <NavLink className={protectedNavClassName} onClick={handleProtectedNavClick} to="/orders">
            Order History
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            to="/warehouse/priority"
          >
            Warehouse Priority Queue
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            to="/scoring"
          >
            Run Scoring
          </NavLink>
        </nav>
      </header>

      <div className="banner">
        {customerLoading ? (
          <span>Loading selected customer...</span>
        ) : customer ? (
          <>
            <div>
              <strong>Current customer:</strong> {customer.full_name} ({customer.email})
            </div>
            <button className="button button-secondary" onClick={clearCustomer} type="button">
              Clear
            </button>
          </>
        ) : (
          <span>No customer selected.</span>
        )}
      </div>

      <main className="page">
        <Outlet />
      </main>

      {toastMessage ? <div className="toast-notification">{toastMessage}</div> : null}
    </div>
  );
}

function PageHeader({ eyebrow, title, copy, right }) {
  return (
    <section className="section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {right || <p className="section-copy">{copy}</p>}
    </section>
  );
}

function LoadingCard({ label = "Loading..." }) {
  return <div className="card">{label}</div>;
}

function ErrorCard({ message }) {
  return <div className="alert alert-error">{message}</div>;
}

function useRequireCustomer() {
  const { customer, customerLoading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerLoading && !customer) {
      navigate("/select-customer");
    }
  }, [customer, customerLoading, navigate]);

  return { customer, customerLoading };
}

function SelectCustomerPage() {
  const { refreshCustomer } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
      setLoading(true);

      try {
        const data = await api(`/customers?q=${encodeURIComponent(query)}`);

        if (isMounted) {
          setCustomers(data.customers);
          setError("");
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadCustomers();
    return () => {
      isMounted = false;
    };
  }, [query]);

  async function selectCustomer(customerId) {
    try {
      await api("/select-customer", {
        method: "POST",
        body: JSON.stringify({ customerId })
      });
      await refreshCustomer();
      navigate("/dashboard");
    } catch (selectionError) {
      setError(selectionError.message);
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Step 1"
        title="Select Customer"
        copy="There is no authentication in this demo. Pick an existing customer record to act as while testing the app."
      />

      <div className="card stack-md">
        <div className="search-row">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
          />
        </div>

        {error ? <ErrorCard message={error} /> : null}

        {loading ? (
          <LoadingCard label="Loading customers..." />
        ) : customers.length === 0 ? (
          <div className="empty-state">No customers matched that search.</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.customer_id}>
                    <td>{customer.customer_id}</td>
                    <td>{customer.full_name}</td>
                    <td>{customer.email}</td>
                    <td>
                      <button
                        className="button button-primary"
                        onClick={() => selectCustomer(customer.customer_id)}
                        type="button"
                      >
                        Use Customer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardPage() {
  const { customerLoading } = useRequireCustomer();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      try {
        const data = await api("/dashboard");

        if (isMounted) {
          setSummary(data);
          setError("");
        }
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          return;
        }

        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSummary();
    return () => {
      isMounted = false;
    };
  }, []);

  if (customerLoading || loading) {
    return <LoadingCard label="Loading dashboard..." />;
  }

  if (error) {
    return <ErrorCard message={error} />;
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Customer View"
        title="Dashboard"
        copy="Summary data comes from Supabase. Fulfillment is derived from whether a shipment row exists."
      />

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Customer</span>
          <strong>{summary.customer.full_name}</strong>
          <span>{summary.customer.email}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total orders</span>
          <strong>{summary.stats.totalOrders}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total spend</span>
          <strong>{formatCurrency(summary.stats.totalSpend)}</strong>
        </div>
      </div>

      <div className="card stack-md">
        <div className="section-row">
          <h3>Recent orders</h3>
        </div>

        {summary.recentOrders.length === 0 ? (
          <div className="empty-state">This customer has no orders yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Order time</th>
                  <th>Fulfilled</th>
                  <th>Total value</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentOrders.map((order) => (
                  <tr key={order.order_id}>
                    <td>
                      <Link className="text-link" to={`/orders/${order.order_id}`}>
                        {order.order_id}
                      </Link>
                    </td>
                    <td>{formatDateTime(order.order_datetime)}</td>
                    <td>
                      <span className={order.fulfilled ? "pill pill-success" : "pill pill-warn"}>
                        {order.fulfilled ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{formatCurrency(order.order_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceOrderPage() {
  const { customer, customerLoading } = useRequireCustomer();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        const data = await api("/products");

        if (isMounted) {
          setProducts(data.products);
          setRows(
            data.products.length
              ? [{ key: Date.now(), productId: data.products[0].product_id, quantity: 1 }]
              : []
          );
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  if (customerLoading || loading) {
    return <LoadingCard label="Loading order form..." />;
  }

  function addRow() {
    if (!products.length) {
      return;
    }

    setRows((currentRows) => [
      ...currentRows,
      { key: Date.now(), productId: products[0].product_id, quantity: 1 }
    ]);
  }

  function updateRow(key, field, value) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  }

  function removeRow(key) {
    setRows((currentRows) =>
      currentRows.length === 1 ? currentRows : currentRows.filter((row) => row.key !== key)
    );
  }

  async function submitOrder(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          lineItems: rows.map((row) => ({
            productId: Number(row.productId),
            quantity: Number(row.quantity)
          }))
        })
      });

      navigate(`/orders?placed=1&orderId=${result.orderId}`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const estimatedSubtotal = rows.reduce((sum, row) => {
    const product = products.find((item) => item.product_id === Number(row.productId));
    return sum + (product ? Number(product.price) * Number(row.quantity || 0) : 0);
  }, 0);

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Customer Action"
        title="Place Order"
        copy={`Create a new order for ${customer?.full_name}. The API writes the order and line items directly into Supabase.`}
      />

      {error ? <ErrorCard message={error} /> : null}

      {!products.length ? (
        <div className="alert alert-error">No active products were found in the database.</div>
      ) : (
        <form className="stack-lg" onSubmit={submitOrder}>
          <div className="card stack-md">
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const product = products.find((item) => item.product_id === Number(row.productId));

                    return (
                      <tr key={row.key}>
                        <td>
                          <select
                            className="input"
                            value={row.productId}
                            onChange={(event) =>
                              updateRow(row.key, "productId", Number(event.target.value))
                            }
                          >
                            {products.map((item) => (
                              <option key={item.product_id} value={item.product_id}>
                                {item.product_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input"
                            min="1"
                            type="number"
                            value={row.quantity}
                            onChange={(event) =>
                              updateRow(row.key, "quantity", Number(event.target.value))
                            }
                          />
                        </td>
                        <td>{formatCurrency(product?.price)}</td>
                        <td>
                          <button
                            className="button button-secondary"
                            onClick={() => removeRow(row.key)}
                            disabled={rows.length === 1}
                            type="button"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="actions">
              <button className="button button-secondary" onClick={addRow} type="button">
                Add line item
              </button>
              <div className="summary-chip">
                Estimated subtotal: {formatCurrency(estimatedSubtotal)}
              </div>
            </div>
          </div>

          <div className="actions">
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? "Placing order..." : "Place order"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function OrdersPage() {
  const { customerLoading } = useRequireCustomer();
  const [ordersData, setOrdersData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      try {
        const data = await api("/orders");

        if (isMounted) {
          setOrdersData(data);
        }
      } catch (loadError) {
        if (!(loadError instanceof ApiError && loadError.status === 401) && isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  if (customerLoading || loading) {
    return <LoadingCard label="Loading order history..." />;
  }

  if (error) {
    return <ErrorCard message={error} />;
  }

  if (!ordersData) {
    return null;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Customer Orders"
        title="Order History"
        copy={`Reviewing orders for ${ordersData.customer.full_name}. Click any order to inspect its line items and totals.`}
      />

      {searchParams.get("placed") === "1" ? (
        <div className="alert alert-success">
          Order {searchParams.get("orderId") ? `#${searchParams.get("orderId")} ` : ""}
          was created successfully.
        </div>
      ) : null}

      <div className="card">
        {ordersData.orders.length === 0 ? (
          <div className="empty-state">No orders found for this customer.</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Order time</th>
                  <th>Fulfilled</th>
                  <th>Total value</th>
                </tr>
              </thead>
              <tbody>
                {ordersData.orders.map((order) => (
                  <tr key={order.order_id}>
                    <td>
                      <Link className="text-link" to={`/orders/${order.order_id}`}>
                        {order.order_id}
                      </Link>
                    </td>
                    <td>{formatDateTime(order.order_datetime)}</td>
                    <td>
                      <span className={order.fulfilled ? "pill pill-success" : "pill pill-warn"}>
                        {order.fulfilled ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{formatCurrency(order.order_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailPage() {
  const { customerLoading } = useRequireCustomer();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { orderId } = useParams();

  useEffect(() => {
    let isMounted = true;

    async function loadDetail() {
      try {
        const data = await api(`/orders/${orderId}`);

        if (isMounted) {
          setDetail(data);
        }
      } catch (loadError) {
        if (!(loadError instanceof ApiError && loadError.status === 401) && isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      isMounted = false;
    };
  }, [orderId]);

  if (customerLoading || loading) {
    return <LoadingCard label="Loading order detail..." />;
  }

  if (error) {
    return <ErrorCard message={error} />;
  }

  if (!detail) {
    return null;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Order Detail"
        title={`Order #${detail.order.order_id}`}
        right={
          <Link className="text-link" to="/orders">
            Back to order history
          </Link>
        }
      />

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Placed</span>
          <strong>{formatDateTime(detail.order.order_datetime)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Fulfilled</span>
          <strong>{detail.order.fulfilled ? "Yes" : "No"}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Order total</span>
          <strong>{formatCurrency(detail.order.order_total)}</strong>
        </div>
      </div>

      <div className="card stack-md">
        <h3>Line items</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.order_item_id}>
                  <td>{item.product_name}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unit_price)}</td>
                  <td>{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3">Subtotal</td>
                <td>{formatCurrency(detail.order.order_subtotal)}</td>
              </tr>
              <tr>
                <td colSpan="3">Shipping</td>
                <td>{formatCurrency(detail.order.shipping_fee)}</td>
              </tr>
              <tr>
                <td colSpan="3">Tax</td>
                <td>{formatCurrency(detail.order.tax_amount)}</td>
              </tr>
              <tr>
                <td colSpan="3">
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{formatCurrency(detail.order.order_total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function WarehousePriorityPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadQueue() {
      try {
        const queueData = await api("/warehouse/priority");

        if (isMounted) {
          setData(queueData);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadQueue();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingCard label="Loading warehouse queue..." />;
  }

  if (error) {
    return <ErrorCard message={error} />;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Warehouse Workflow"
        title="Late Delivery Priority Queue"
        copy="This queue surfaces the highest-risk unshipped orders first so operations teams can intervene before a late delivery becomes a customer issue."
      />

      {data.status === "missing_table" ? (
        <div className="alert alert-error">
          <code>order_predictions</code> does not exist yet. Add your pipeline output
          table and rerun scoring to populate this queue.
        </div>
      ) : null}

      {data.status === "schema_mismatch" ? (
        <div className="alert alert-error">
          <code>order_predictions</code> is missing required columns:{" "}
          {data.missingColumns.join(", ")}.
        </div>
      ) : null}

      {data.status === "ready" ? (
        <div className="card">
          {data.rows.length === 0 ? (
            <div className="empty-state">
              No unshipped scored orders are available yet. Place a new order and run the
              scoring job after your pipeline is connected.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Order time</th>
                    <th>Customer</th>
                    <th>Total value</th>
                    <th>Late probability</th>
                    <th>Predicted late</th>
                    <th>Scored at</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.order_id}>
                      <td>{row.order_id}</td>
                      <td>{formatDateTime(row.order_timestamp)}</td>
                      <td>{row.customer_name}</td>
                      <td>{formatCurrency(row.total_value)}</td>
                      <td>{Number(row.late_delivery_probability).toFixed(3)}</td>
                      <td>
                        <span
                          className={
                            row.predicted_late_delivery ? "pill pill-warn" : "pill pill-success"
                          }
                        >
                          {row.predicted_late_delivery ? "Yes" : "No"}
                        </span>
                      </td>
                      <td>{formatDateTime(row.prediction_timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ScoringPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function runScoring() {
    setRunning(true);
    setError("");

    try {
      const data = await api("/scoring/run", {
        method: "POST",
        body: JSON.stringify({})
      });

      setResult(data);
    } catch (runError) {
      if (runError instanceof ApiError && runError.data) {
        setResult(runError.data);
      } else {
        setError(runError.message);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Pipeline Trigger"
        title="Run Scoring"
        copy="The deployed app does not execute Python directly. Run your external pipeline to write predictions into Supabase, then refresh the warehouse priority workflow."
      />

      <div className="card stack-md">
        <p>
          The web app expects your ML pipeline to write results into{" "}
          <code>order_predictions</code> in Supabase.
        </p>

        <div className="actions">
          <button className="button button-primary" disabled={running} onClick={runScoring}>
            {running ? "Running scoring..." : "Run scoring"}
          </button>
        </div>

        {error ? <ErrorCard message={error} /> : null}

        {result?.message ? (
          <div className={result.ok ? "alert alert-success" : "alert alert-error"}>
            <p>{result.message}</p>
            {result.ordersScored !== null ? (
              <p>
                <strong>Orders scored:</strong> {result.ordersScored}
              </p>
            ) : null}
            {result.ranAt ? (
              <p>
                <strong>Timestamp:</strong> {result.ranAt}
              </p>
            ) : null}
          </div>
        ) : null}

        {result?.stdout ? (
          <div className="card stack-sm">
            <h3>Stdout</h3>
            <pre className="code-block">{result.stdout}</pre>
          </div>
        ) : null}

        {result?.stderr ? (
          <div className="card stack-sm">
            <h3>Stderr</h3>
            <pre className="code-block">{result.stderr}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SchemaPage() {
  const [schema, setSchema] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadSchema() {
      try {
        const data = await api("/schema");

        if (isMounted) {
          setSchema(data.schema);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSchema();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingCard label="Loading schema..." />;
  }

  if (error) {
    return <ErrorCard message={error} />;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Developer Only"
        title="Database Schema"
        copy="This page prints the tables currently reachable through the Supabase-backed API."
      />

      {schema.map((table) => (
        <section className="card stack-sm" key={table.name}>
          <h3>{table.name}</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Not Null</th>
                  <th>Default</th>
                  <th>PK</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((column) => (
                  <tr key={`${table.name}-${column.name}`}>
                    <td>{column.name}</td>
                    <td>{column.type || "N/A"}</td>
                    <td>{column.notnull ? "Yes" : "No"}</td>
                    <td>{column.dflt_value ?? "NULL"}</td>
                    <td>{column.pk ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function App() {
  const [customer, setCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(true);

  async function refreshCustomer() {
    setCustomerLoading(true);

    try {
      const data = await api("/customer/current");
      setCustomer(data.customer);
    } catch {
      setCustomer(null);
    } finally {
      setCustomerLoading(false);
    }
  }

  useEffect(() => {
    refreshCustomer();
  }, []);

  return (
    <AppContext.Provider
      value={{
        customer,
        customerLoading,
        refreshCustomer
      }}
    >
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate replace to="/select-customer" />} />
          <Route path="/select-customer" element={<SelectCustomerPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/place-order" element={<PlaceOrderPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/warehouse/priority" element={<WarehousePriorityPage />} />
          <Route path="/scoring" element={<ScoringPage />} />
          <Route path="/debug/schema" element={<SchemaPage />} />
        </Route>
      </Routes>
    </AppContext.Provider>
  );
}
