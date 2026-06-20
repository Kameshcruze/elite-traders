import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShoppingBag, Trash2, Plus, Minus, CheckCircle2, XCircle, 
  AlertCircle, RefreshCw, CreditCard, ArrowRight, Lock, 
  Database, User, Phone, MapPin, Sparkles, Package, ShieldCheck
} from "lucide-react";

// For typescript window integration
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface OrderRecord {
  id?: number;
  custom_order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  amount: number;
  payment_status: "pending" | "paid" | "failed";
  created_at?: string;
}

export default function App() {
  // Navigation & View States
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<"M" | "L" | "XL">("M");
  const [quantity, setQuantity] = useState(1);
  const [cartItems, setCartItems] = useState<{ id: string; name: string; price: number; quantity: number; size: string }[]>([]);
  
  // Checkout Form States
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTesterGuide, setShowTesterGuide] = useState(true);
  
  // App Feedback States
  const [paymentResult, setPaymentResult] = useState<{
    status: "success" | "failure";
    customOrderId: string;
    razorpayOrderId: string;
    razorpayPaymentId?: string;
    errorMessage?: string;
  } | null>(null);

  // Supabase Table Log state
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderQueryError, setOrderQueryError] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{ connected: boolean; error: string | null }>({ connected: true, error: null });
  const [showSqlGuide, setShowSqlGuide] = useState(false);

  // Admin Verification States
  const [adminPassword, setAdminPassword] = useState<string>(() => {
    return localStorage.getItem("elite_admin_password") || "";
  });
  const [enteredUsername, setEnteredUsername] = useState<string>("");
  const [isLoggedAdmin, setIsLoggedAdmin] = useState<boolean>(() => {
    return localStorage.getItem("elite_admin_logged") === "true";
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [checkingLogin, setCheckingLogin] = useState(false);

  // Fetch orders logged in database (Secured via header token)
  const fetchOrders = async (pwd: string = adminPassword) => {
    if (!pwd) return;
    try {
      setLoadingOrders(true);
      setOrderQueryError(null);
      const res = await fetch("/api/orders", {
        headers: {
          "Authorization": `Bearer ${pwd}`
        }
      });
      if (res.status === 401) {
        throw new Error("Invalid admin authorization credentials");
      }
      if (!res.ok) {
        throw new Error(`HTTP status error: ${res.status}`);
      }
      const data = await res.json();
      if (data && typeof data === "object" && "orders" in data) {
        setOrders(data.orders);
        setSupabaseStatus({
          connected: data.supabaseConnected !== false,
          error: data.supabaseError || null
        });
      } else {
        setOrders(Array.isArray(data) ? data : []);
        setSupabaseStatus({ connected: true, error: null });
      }
    } catch (err: any) {
      console.error("Error reading live DB:", err);
      setOrderQueryError(err.message || "Failed to load logged transactions");
      if (err.message && err.message.includes("Invalid admin")) {
        handleAdminLogout();
      } else {
        setSupabaseStatus({ connected: false, error: err.message || "Network API exception" });
      }
    } finally {
      setLoadingOrders(false);
    }
  };

  // Secure validation handler for checking Admin Credentials
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setCheckingLogin(true);

    if (!enteredUsername || !adminPassword) {
      setLoginError("Please enter both administrative username and access password.");
      setCheckingLogin(false);
      return;
    }

    try {
      const res = await fetch("/api/orders", {
        headers: {
          "Authorization": `Bearer ${adminPassword}`
        }
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("Invalid admin access credentials. Access Denied.");
      }

      if (!res.ok) {
        throw new Error(`Verification request returned status ${res.status}`);
      }

      // If authorized, save the state securely
      localStorage.setItem("elite_admin_password", adminPassword);
      localStorage.setItem("elite_admin_logged", "true");
      setIsLoggedAdmin(true);
      
      const data = await res.json();
      if (data && typeof data === "object" && "orders" in data) {
        setOrders(data.orders);
        setSupabaseStatus({
          connected: data.supabaseConnected !== false,
          error: data.supabaseError || null
        });
      } else {
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      setLoginError(err.message || "Login authentication failed due to server error.");
    } finally {
      setCheckingLogin(false);
    }
  };

  // Clear credentials on logout
  const handleAdminLogout = () => {
    localStorage.removeItem("elite_admin_password");
    localStorage.removeItem("elite_admin_logged");
    setAdminPassword("");
    setEnteredUsername("");
    setIsLoggedAdmin(false);
    setOrders([]);
    setLoginError(null);
  };

  // Run initial fetch and periodic syncing ONLY if logged in
  useEffect(() => {
    if (isLoggedAdmin && adminPassword) {
      fetchOrders(adminPassword);
      const interval = setInterval(() => {
        fetchOrders(adminPassword);
      }, 10000); // Poll every 10 seconds securely for verified admins only
      return () => clearInterval(interval);
    }
  }, [isLoggedAdmin, adminPassword]);

  // Cart actions
  const handleAddToCart = () => {
    const existingIndex = cartItems.findIndex(i => i.size === selectedSize);
    if (existingIndex > -1) {
      const updated = [...cartItems];
      updated[existingIndex].quantity += quantity;
      setCartItems(updated);
    } else {
      setCartItems([
        ...cartItems,
        {
          id: "tshirt-premium",
          name: `Premium Black T-Shirt (${selectedSize})`,
          price: 100,
          quantity: quantity,
          size: selectedSize
        }
      ]);
    }
    // Auto-open drawer for premium interaction feedback
    setCartOpen(true);
    // Dynamic resets
    setQuantity(1);
  };

  const handleRemoveFromCart = (index: number) => {
    const updated = cartItems.filter((_, i) => i !== index);
    setCartItems(updated);
  };

  const updateCartQuantity = (index: number, delta: number) => {
    const updated = [...cartItems];
    const newQty = updated[index].quantity + delta;
    if (newQty > 0) {
      updated[index].quantity = newQty;
      setCartItems(updated);
    } else {
      handleRemoveFromCart(index);
    }
  };

  const getCartTotal = () => {
    return cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };

  const getCartCount = () => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  };

  // Launch Checkout & Payments (Razorpay SDK)
  const handlePaySecurely = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !address.trim()) {
      alert("Please fill in all checkout form details.");
      return;
    }

    const totalQuantity = cartItems.reduce((acc, i) => acc + i.quantity, 0);
    if (totalQuantity < 1) {
      alert("Your cart is empty. Please add the Premium Black T-Shirt to start.");
      return;
    }

    try {
      setIsSubmitting(true);
      setPaymentResult(null);

      // 1. Fetch Razorpay configuration
      const configRes = await fetch("/api/config");
      if (!configRes.ok) throw new Error("Could not load backend configurations key ID");
      const { razorpayKeyId } = await configRes.json();

      // 2. Call backend order creation integration (This calculates amount & pre-saves row into Supabase)
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          phone,
          address,
          quantity: totalQuantity
        })
      });

      if (!orderRes.ok) {
        const errorData = await orderRes.json();
        throw new Error(errorData.error || "Failed to initiate backend order tracking");
      }

      const orderData = await orderRes.json();
      const { orderId, customOrderId, amount, currency } = orderData;

      console.log("[Razorpay Init] Backend Order successfully created:", orderData);

      // Standardize Phone formatting to prefix with country code (+91)
      // This forces Razorpay to realize the buyer is domestic Indian, avoiding US IP/Iframe checks and "International payments are not applicable"
      let formattedPhone = phone.trim().replace(/\s+/g, "");
      if (!formattedPhone.startsWith("+")) {
        // Remove any leading zeroes
        formattedPhone = formattedPhone.replace(/^0+/, "");
        if (formattedPhone.startsWith("91") && formattedPhone.length > 10) {
          formattedPhone = `+${formattedPhone}`;
        } else {
          formattedPhone = `+91${formattedPhone}`;
        }
      }
      console.log("[Razorpay Init] Local country code prefixed phone for Indian regional context:", formattedPhone);

      // 3. Mount Razorpay Test Mode Popup client options with UPI collect/qr display config
      const options = {
        key: razorpayKeyId,
        amount: amount,
        currency: currency,
        name: "Elite Traders",
        description: `Order ${customOrderId} x${totalQuantity} - Payment verification test`,
        image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80", // Premium t-shirt mockup aspect
        order_id: orderId,
        config: {
          display: {
            blocks: {
              upiBlock: {
                name: "Pay using UPI / QR",
                instruments: [
                  {
                    method: "upi",
                    flows: ["collect", "qr"]
                  }
                ]
              }
            },
            sequence: ["block.upiBlock"],
            preferences: {
              show_default_blocks: true
            }
          }
        },
        handler: async function (response: any) {
          try {
            setIsVerifying(true);
            console.log("Razorpay checkout successful. Signature payload received:", response);

            // POST sign parameters to backend verify API
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              throw new Error(verifyData.error || "Payment verification failed");
            }

            console.log("Payment signature verified, Supabase row updated as PAID.");

            // Display glorious Success visual card
            setPaymentResult({
              status: "success",
              customOrderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id
            });

            // Clean UI cart
            setCartItems([]);
            // Refresh DB inspector table instantly
            fetchOrders();
          } catch (err: any) {
            console.error("Signature post validation failed:", err);
            setPaymentResult({
              status: "failure",
              customOrderId,
              razorpayOrderId: orderId,
              errorMessage: err.message || "Failed post-payment server checks"
            });
            fetchOrders();
          } finally {
            setIsVerifying(false);
          }
        },
        prefill: {
          name: customerName,
          contact: formattedPhone,
          email: "test_customer@elitetraders.com"
        },
        theme: {
          color: "#0f172a" // Premium deep graphite slate matching custom look
        },
        modal: {
          ondismiss: async function() {
            console.warn("User aborted Razorpay Payment Widget.");
            
            // Mark as failed in DB log mapping requirement
            try {
              await fetch("/api/payment-failed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ razorpay_order_id: orderId })
              });
            } catch (err) {
              console.error("Failed recording user dismiss trigger:", err);
            }
            
            setPaymentResult({
              status: "failure",
              customOrderId,
              razorpayOrderId: orderId,
              errorMessage: "Payment cancelled by the user"
            });
            
            // Reload inspector log
            fetchOrders();
          }
        }
      };

      // Open Razorpay iframe popup
      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();

    } catch (err: any) {
      console.error("Checkout transaction initialization failure:", err);
      alert(`Initialization failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between" id="app-root">
      
      {/* 1. NAVIGATION BAR */}
      <nav id="navbar" className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Logo */}
            <div className="flex items-center space-x-2 cursor-pointer" onClick={() => scrollToSection("hero")}>
              <div className="h-9 w-9 rounded-lg bg-slate-950 flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
                E
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-950 font-sans">
                Elite Traders
              </span>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wider uppercase">
                Test Mode
              </span>
            </div>

            {/* Nav Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={() => scrollToSection("hero")} className="text-slate-600 hover:text-slate-950 font-medium transition-colors text-sm">Home</button>
              <button onClick={() => scrollToSection("product")} className="text-slate-600 hover:text-slate-950 font-medium transition-colors text-sm">Products</button>
              <button onClick={() => scrollToSection("supabase-inspector")} className="text-slate-600 hover:text-slate-950 font-medium transition-colors text-sm flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                Live Supabase Orders
              </button>
            </div>

            {/* Cart trigger button */}
            <div className="flex items-center space-x-4">
              <button 
                id="cart-btn"
                onClick={() => setCartOpen(true)}
                className="relative bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200/60 p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 duration-200 flex items-center justify-center cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5 text-slate-700" />
                {getCartCount() > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-rose-600 text-white font-extrabold text-[10px] h-5 w-5 rounded-full flex items-center justify-center shadow-sm"
                  >
                    {getCartCount()}
                  </motion.span>
                )}
              </button>
            </div>

          </div>
        </div>
      </nav>

      {/* 2. HERO BANNER */}
      <header id="hero" className="relative overflow-hidden bg-slate-950 text-white py-20 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#1e293b,transparent)] opacity-60"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="lg:max-w-2xl text-left">
            <motion.div 
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/55 px-3.5 py-1 rounded-full text-xs font-semibold text-emerald-400 mb-6"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Razorpay Test Gateway Active
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight"
            >
              Premium Clothing at <br />
              <span className="text-emerald-400">Best Prices</span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-lg sm:text-xl text-slate-300 leading-relaxed font-sans font-light"
            >
              Test our secure online checkout experience. This isolated sandbox lets you preview test transactions mapping live to Supabase instantly.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10 flex flex-wrap gap-4"
            >
              <button 
                onClick={() => scrollToSection("product")}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-3.5 rounded-lg shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all duration-200 flex items-center gap-2 cursor-pointer text-sm"
              >
                Shop Now <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scrollToSection("supabase-inspector")}
                className="bg-slate-800/90 hover:bg-slate-800 text-white border border-slate-700 font-semibold px-6 py-3.5 rounded-lg active:scale-95 transition-all duration-200 text-sm cursor-pointer"
              >
                View Live Orders Table
              </button>
            </motion.div>
          </div>
        </div>
      </header>

      {/* DYNAMIC NOTIFICATIONS / STATE BANNERS (IF PAYMENTS HAPPENED) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full mt-6">
        <AnimatePresence>
          {paymentResult && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-6 rounded-2xl border ${
                paymentResult.status === "success" 
                  ? "bg-emerald-50/90 border-emerald-200 text-emerald-900" 
                  : "bg-rose-50/90 border-rose-200 text-rose-900"
              } shadow-sm relative overflow-hidden`}
              id="payment-result-banner"
            >
              <button 
                onClick={() => setPaymentResult(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 cursor-pointer text-sm font-semibold p-1"
              >
                Dismiss
              </button>

              <div className="flex items-start gap-4 mr-8">
                {paymentResult.status === "success" ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-8 h-8 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-bold tracking-tight">
                    {paymentResult.status === "success" 
                      ? "Test Payment Completed Successfully!" 
                      : "Test Payment Failed / Cancelled"}
                  </h3>
                  
                  <p className="mt-2 text-sm text-slate-600">
                    {paymentResult.status === "success" 
                      ? "Your signature was validated on the server. The database record now shows 'paid' state."
                      : `The payment was not verified. ${paymentResult.errorMessage || ""}`}
                  </p>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white/80 border border-slate-100 p-2.5 rounded-lg">
                      <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Custom Order ID</span>
                      <span className="font-mono text-sm text-slate-800 font-bold">{paymentResult.customOrderId}</span>
                    </div>
                    <div className="bg-white/80 border border-slate-100 p-2.5 rounded-lg">
                      <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Razorpay Order ID</span>
                      <span className="font-mono text-xs text-slate-600 truncate block">{paymentResult.razorpayOrderId}</span>
                    </div>
                    {paymentResult.razorpayPaymentId && (
                      <div className="bg-white/80 border border-slate-100 p-2.5 rounded-lg">
                        <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Razorpay Payment ID</span>
                        <span className="font-mono text-xs text-emerald-600 font-semibold">{paymentResult.razorpayPaymentId}</span>
                      </div>
                    )}
                  </div>

                  <p className="mt-4 text-xs font-semibold text-indigo-600 flex items-center gap-1">
                    <Database className="w-3 h-3 text-indigo-500" />
                    Verify this record instantaneously in the live database console log at the bottom.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {isVerifying && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-indigo-50/90 border border-indigo-200 text-indigo-900 p-6 rounded-2xl flex items-center gap-4 shadow-sm"
              id="payment-verifying-banner"
            >
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin shrink-0" />
              <div>
                <h4 className="text-base font-bold">Verifying Signature Payment with Server...</h4>
                <p className="text-xs text-indigo-700/80 mt-0.5">Please wait while our backend checks HSM hashing algorithms and updates Supabase database status.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. CORE PRODUCT SECTION + CHECKOUT */}
      <main id="product" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full flex-grow">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Featured Tester Product
          </h2>
          <p className="mt-3 text-slate-500 text-sm">
            Add test items and proceed to securely pay ₹100 multiplied by Quantity.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* LEFT COLUMN: PRODUCT CANVAS */}
          <div className="lg:col-span-7 bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row gap-8 items-center md:items-start relative">
            
            {/* Elegant SVG visual representation of product */}
            <div className="w-full md:w-80 h-96 bg-slate-100 rounded-2xl flex items-center justify-center relative overflow-hidden shrink-0 group border border-slate-200/45">
              <div className="absolute inset-x-0 bottom-0 py-2.5 bg-slate-950/5/90 text-center text-[10px] uppercase font-bold tracking-widest text-slate-500">
                Premium Fabrics
              </div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="relative w-64 h-64 flex items-center justify-center"
              >
                {/* Custom Vector T-Shirt SVG for high performance visual without heavy external images */}
                <svg className="w-56 h-56 text-slate-900 cursor-zoom-in filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                  {/* Styled clean minimal vector t-shirt */}
                  <path d="M19.4 6.5l-3.3-1.6c-.4-.2-.8-.2-1.2 0L12 6.3 9.1 4.9c-.4-.2-.8-.2-1.2 0L4.6 6.5c-.4.2-.6.7-.4 1.1l1.5 4.5c.1.3.4.5.7.5H8v6c0 .6.4 1 1 1h6c.6 0 1-.4 1-1v-6h1.6c.3 0 .6-.2.7-.5l1.5-4.5c.2-.4.1-.9-.4-1.1z"/>
                </svg>
                {/* Mini branding text inside t-shirt vector */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/90 text-center pointer-events-none select-none">
                  <span className="text-[10px] tracking-widest uppercase font-extrabold block">ELITE</span>
                  <span className="text-[8px] tracking-wider text-slate-400 font-sans block mt-0.5">TRADERS</span>
                </div>
              </motion.div>
            </div>

            {/* DETAILS CONTENT */}
            <div className="flex-grow flex flex-col justify-between h-full w-full">
              <div>
                <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider">
                  Exclusive Clothing
                </span>
                <h3 className="text-2xl font-bold tracking-tight text-slate-950 mt-3" id="product-title">
                  Premium Black T-Shirt
                </h3>
                
                {/* Price Label */}
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-slate-950 font-mono">₹100</span>
                  <span className="text-sm font-semibold text-slate-400 line-through">₹1,299</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Save 92% (Test Mode Special)
                  </span>
                </div>

                <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                  Carefully spun using standard combed ringspurn cotton. Exquisite texture, breathable thickness, and reinforced stitching for testing luxury.
                </p>

                {/* Specs bullets */}
                <div className="mt-6 space-y-2 border-t border-slate-100 pt-6">
                  <div className="flex items-center gap-2.5 text-xs text-slate-500 font-medium">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
                    Premium heavyweight cotton fabric
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-500 font-medium">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
                    Ultra-soft and breathable tailored fit
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-500 font-medium">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
                    Minimalist premium double-knit neckrib
                  </div>
                </div>

                {/* Interactive Size Badges */}
                <div className="mt-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Select Size
                  </label>
                  <div className="flex gap-2">
                    {(["M", "L", "XL"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all duration-150 cursor-pointer ${
                          selectedSize === size
                            ? "bg-slate-950 text-white border-slate-950 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity incrementor */}
                <div className="mt-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Quantity
                  </label>
                  <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 p-1">
                    <button 
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="p-1.5 rounded-md hover:bg-white text-slate-600 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-4 font-mono font-bold text-slate-900 text-sm w-8 text-center">{quantity}</span>
                    <button 
                      onClick={() => setQuantity(q => q + 1)}
                      className="p-1.5 rounded-md hover:bg-white text-slate-600 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ACTION ADD BUTTON */}
              <div className="mt-8 border-t border-slate-100 pt-6">
                <button
                  id="add-to-cart-btn"
                  onClick={handleAddToCart}
                  className="w-full bg-slate-950 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl hover:shadow-lg active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" /> Add to Cart (₹{(100 * quantity).toLocaleString()})
                </button>
              </div>

            </div>

          </div>

          {/* RIGHT COLUMN: ACTIVE CART BREAKDOWN & SECURE CHECKOUT FORM */}
          <div className="lg:col-span-12 xl:col-span-5 bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm">
            
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h3 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-slate-700" />
                Shopping Checkout Cart
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Ensure checkout accuracy before executing test mode payment.
              </p>
            </div>

            {cartItems.length === 0 ? (
              /* EMPTY CART VIEWER */
              <div className="py-20 text-center flex flex-col items-center justify-center">
                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center border border-dashed border-slate-200 text-slate-400 mb-4 animate-pulse">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h4 className="text-slate-700 font-bold text-base">Checkout is locked</h4>
                <p className="text-slate-400 text-xs mt-1 max-w-xs mx-auto">
                  Add the Premium Black T-shirt from the left card to customize test variables and ignite payment operations.
                </p>
                <button
                  onClick={() => scrollToSection("product")}
                  className="mt-6 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Add Test Product Now
                </button>
              </div>
            ) : (
              /* ACTIVE CHECKOUT SCREEN */
              <div>
                
                {/* 1. Products list overview */}
                <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1">Items Summary</span>
                  {cartItems.map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex justify-between items-center text-sm">
                      <div className="flex-grow">
                        <span className="font-bold text-slate-800 font-sans block">{item.name}</span>
                        <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>Size: {item.size}</span>
                          <span>•</span>
                          <span>₹{item.price} each</span>
                        </div>
                      </div>
                      
                      {/* Controls inside basket */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-slate-200 bg-white rounded-md p-0.5">
                          <button 
                            onClick={() => updateCartQuantity(index, -1)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 transition"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="px-2 font-mono text-xs font-bold text-slate-800">{item.quantity}</span>
                          <button 
                            onClick={() => updateCartQuantity(index, 1)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 transition"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        <button 
                          onClick={() => handleRemoveFromCart(index)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Calculations total */}
                  <div className="border-t border-slate-200/50 pt-3 mt-3 flex justify-between items-baseline">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Total Amount</span>
                    <span className="text-xl font-black text-slate-950 font-mono">₹{getCartTotal().toLocaleString()}</span>
                  </div>
                </div>

                {/* 2. Customer form fields */}
                <form onSubmit={handlePaySecurely} className="space-y-4">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-2">Customer Details Form</span>
                  
                  {/* Name field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> Customer Name
                    </label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors"
                    />
                  </div>

                  {/* Phone field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" /> Phone Number
                    </label>
                    <input 
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors"
                    />
                    <span className="text-[10px] text-slate-400 leading-normal block mt-1">Useful to mock checkout prefills.</span>
                  </div>

                  {/* Address field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" /> Address Details
                    </label>
                    <textarea 
                      required
                      rows={2}
                      placeholder="e.g. Flat 101, Prestige Apartments, Mumbai"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors resize-none"
                    />
                  </div>

                  {/* Security badges */}
                  <div className="flex gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] text-slate-500 leading-normal">
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <Lock className="w-3.5 h-3.5 shrink-0" /> Secure Encryption
                    </div>
                    <div>
                      This payment modal uses genuine Razorpay sandbox scripts securely validated server-side.
                    </div>
                  </div>

                  {/* Sandbox Tester Help Guide */}
                  <div className="bg-amber-50/70 border border-amber-200/50 rounded-xl p-3.5 text-xs text-slate-700">
                    <button
                      type="button"
                      onClick={() => setShowTesterGuide(!showTesterGuide)}
                      className="w-full flex items-center justify-between font-bold text-amber-900 focus:outline-none cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-amber-800">
                        <Sparkles className="w-4 h-4 text-amber-650 shrink-0" />
                        Razorpay India Sandbox Test Cheat Sheet
                      </span>
                      <span className="text-[10px] uppercase font-bold text-amber-700/60 tracking-wider">
                        {showTesterGuide ? "Hide" : "Show Guide"}
                      </span>
                    </button>
                    
                    {showTesterGuide && (
                      <div className="mt-2.5 space-y-2.5 font-sans divide-y divide-amber-200/30 text-slate-700 leading-relaxed">
                        <div className="pt-0">
                          <p className="font-semibold text-amber-800 mb-0.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-amber-700 shrink-0" /> Test Contact Format:
                          </p>
                          <p className="text-[11px]">
                            Enter any <strong className="font-semibold">10-digit phone number</strong> (e.g. <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">9876543210</code>). The system prefixes it with <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">+91</code> to force India country context, completely bypassing any outer global sandbox country geolocation failures.
                          </p>
                        </div>

                        <div className="pt-2">
                          <p className="font-semibold text-amber-800 mb-1 flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-amber-700 shrink-0" /> Domestic Test Cards:
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700">
                            <li>
                              <strong className="font-semibold">Visa/Mastercard:</strong> <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">4111 1111 1111 6666</code> or <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">4111 1111 1111 8888</code>
                            </li>
                            <li>
                              <strong className="font-semibold">RuPay:</strong> <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">6022 8111 1111 1111</code>
                            </li>
                            <li>
                              <strong className="font-semibold">CVV/Expiry:</strong> Any 3 digits & future date (e.g. <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">123</code> / <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">12/30</code>)
                            </li>
                            <li>
                              <strong className="font-semibold">3-Secure OTP:</strong> Enter code <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">123456</code> in the mock OTP web page.
                            </li>
                          </ul>
                        </div>

                        <div className="pt-2">
                          <p className="font-semibold text-amber-800 mb-1 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-700 shrink-0" /> UPI Collect / VPA Simulation:
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700">
                            <li>
                              <strong className="font-semibold">Simulated Success:</strong> Use UPI ID <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">success@razorpay</code> or <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">test@upi</code>.
                            </li>
                            <li>
                              <strong className="font-semibold">Simulated Failure:</strong> Use UPI ID <code className="bg-amber-100 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold text-amber-900">fail@razorpay</code>.
                            </li>
                          </ul>
                          <p className="text-[10px] text-amber-800 font-semibold mt-1">
                            Note: The checkout widget displays BOTH the physical scan QR code and the live UPI ID text input field!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SUBMIT TRIGGERS */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || isVerifying}
                      className={`w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-4 rounded-xl shadow-lg hover:shadow-emerald-600/10 active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                        (isSubmitting || isVerifying) ? "opacity-75 cursor-not-allowed" : ""
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Preparing Payment SDK...
                        </>
                      ) : isVerifying ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Confirming Transaction...
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" /> Pay Securely ₹{getCartTotal().toLocaleString()}
                        </>
                      )}
                    </button>
                    <span className="text-center font-semibold text-[10px] text-slate-400 uppercase tracking-widest block mt-3">
                      Razorpay Test Mode Only
                    </span>
                  </div>

                </form>

              </div>
            )}

          </div>

        </div>

      </main>

      {/* 4. REAL-TIME DATABASE TRANSACTION LOGGER */}
      <section id="supabase-inspector" className="bg-slate-900 text-slate-100 border-t border-slate-800 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {isLoggedAdmin ? (
            <>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 mb-8 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-500/20 text-indigo-400 text-xs font-bold tracking-widest uppercase px-2.5 py-0.5 border border-indigo-500/30 rounded">
                      Developer Sandbox Console
                    </span>
                    <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" title="System synchronizer active"></span>
                  </div>
                  <h2 className="text-2xl font-extrabold tracking-tight mt-2 flex items-center gap-2">
                    <Database className="w-6 h-6 text-indigo-400" />
                    Supabase: "orders" Table Live Stream
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">
                    Authenticated Admin Session. This query reads the records logged in your table directly.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <button
                    onClick={() => fetchOrders(adminPassword)}
                    disabled={loadingOrders}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${loadingOrders ? "animate-spin" : ""}`} />
                    Manual Sync Log
                  </button>

                  <button
                    onClick={handleAdminLogout}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded-lg border border-rose-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    Logout Admin
                  </button>
                </div>
              </div>

              {/* RESILIENT DATABASE inspector VIEWS */}
              {!supabaseStatus.connected && (
                <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-5 mb-8 text-sm text-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-grow">
                      <p className="font-bold text-amber-300 flex items-center gap-1.5 text-base">
                        <Database className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                        Supabase Table Connection Notice
                      </p>
                      <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                        The backend query for the "orders" table failed: <code className="font-mono text-amber-400 font-bold bg-amber-950/80 px-1 py-0.5 rounded text-[11px]">"{supabaseStatus.error || "relation orders does not exist"}"</code>.<br />
                        <strong>We have automatically activated the resilient in-memory transaction database sandbox.</strong> All checkout flows, secure signature validations, and real-time streaming will operate perfectly in this session!
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowSqlGuide(!showSqlGuide)}
                        className="mt-3 text-xs text-cyan-300 hover:text-cyan-200 font-extrabold flex items-center gap-1 focus:outline-none cursor-pointer hover:underline"
                      >
                        <span>{showSqlGuide ? "Hide Setup Script" : "Show Copyable Supabase SQL Setup Script"}</span>
                      </button>
                      {showSqlGuide && (
                        <div className="mt-3.5 p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-left font-mono text-[11px] text-slate-300">
                          <p className="mb-2 text-slate-400 font-sans font-medium text-[11.5px]">Copy and paste this script directly into your Supabase SQL Editor to initialize the table permanently:</p>
                          <pre className="bg-slate-900 p-3 rounded font-bold text-indigo-400 border border-slate-850 overflow-x-auto select-all leading-normal">
    {`CREATE TABLE IF NOT EXISTS orders (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY,
      custom_order_id TEXT PRIMARY KEY,
      razorpay_order_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      razorpay_payment_id TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    -- Enable public select, inserts, and updates for the test mode sandbox
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow public select" ON orders FOR SELECT USING (true);
    CREATE POLICY "Allow public insert" ON orders FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow public update" ON orders FOR UPDATE USING (true);`}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {loadingOrders && orders.length === 0 ? (
                /* LOADER PANEL */
                <div className="py-20 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-2" />
                  <p className="text-slate-400 text-xs text-mono">Streaming records...</p>
                </div>
              ) : orders.length === 0 ? (
                /* EMPTY LOG VIEWER */
                <div className="py-16 text-center bg-slate-950/40 border border-slate-800/80 rounded-2xl">
                  <Package className="w-12 h-12 text-slate-600 mx-auto mb-2.5" />
                  <h4 className="text-slate-300 font-bold">No test records saved yet</h4>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 leading-relaxed">
                    Submit a checkout form and trigger the payment window. Pending orders are pre-saved immediately, and update to "paid" upon verification!
                  </p>
                </div>
              ) : (
                /* LIVE TABLE STREAM GRID */
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-extrabold border-b border-slate-800">
                        <th className="p-4 font-bold">Custom ID</th>
                        <th className="p-4 font-bold">Customer Name</th>
                        <th className="p-4 font-bold">Contact</th>
                        <th className="p-4 font-bold">Amount</th>
                        <th className="p-4 font-bold">Status Badge</th>
                        <th className="p-4 font-bold">Payment Transaction ID</th>
                        <th className="p-4 font-bold">Razorpay Order Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 font-mono">
                      {orders.map((ord, idx) => (
                        <tr key={ord.custom_order_id + idx} className="hover:bg-slate-900/80 transitional-all">
                          <td className="p-4 font-bold text-indigo-400">{ord.custom_order_id}</td>
                          <td className="p-4 text-slate-100 font-sans">{ord.customer_name}</td>
                          <td className="p-4 text-slate-400 text-[11px]">
                            <span className="block">{ord.phone}</span>
                            <span className="block text-[10px] text-slate-500 max-w-xs truncate font-sans">{ord.address}</span>
                          </td>
                          <td className="p-4 font-bold text-slate-200">₹{ord.amount}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                              ord.payment_status === "paid" 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                : ord.payment_status === "failed"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                ord.payment_status === "paid" 
                                  ? "bg-emerald-400" 
                                  : ord.payment_status === "failed"
                                  ? "bg-rose-400"
                                  : "bg-amber-400"
                              }`}></span>
                              {ord.payment_status}
                            </span>
                          </td>
                          <td className="p-4 text-slate-400 font-semibold max-w-[150px] truncate">
                            {ord.razorpay_payment_id ? (
                              <span className="text-emerald-400/90">{ord.razorpay_payment_id}</span>
                            ) : (
                              <span className="text-slate-600 font-normal">N/A (Unpaid)</span>
                            )}
                          </td>
                          <td className="p-4 text-slate-500 text-[10px] max-w-[150px] truncate" title={ord.razorpay_order_id}>
                            {ord.razorpay_order_id}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            /* ADMIN LOGIN CARD */
            <div className="max-w-md mx-auto py-12">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3">
                  <Lock className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-100">Admin Console Gate</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                  Confidential telemetry logs, transaction signatures, and customer records are secured. Please establish authorization.
                </p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-4 bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl">
                {loginError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg flex items-start gap-2 leading-relaxed">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Admin Username
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-xs font-semibold">
                      admin
                    </span>
                    <input
                      type="text"
                      value={enteredUsername}
                      onChange={(e) => setEnteredUsername(e.target.value)}
                      placeholder="Username (e.g. admin)"
                      className="w-full pl-16 pr-3 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Access Password
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password (Default: admin123)"
                    className="w-full px-3 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={checkingLogin}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-bold rounded-lg uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 text-center flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {checkingLogin ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Sign In & Sync Table
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

        </div>
      </section>

      {/* 5. FOOTER FRAME */}
      <footer className="bg-slate-950 text-slate-400 py-10 text-center text-xs border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-semibold text-slate-300">Elite Traders eCommerce Checkout Test Harness</p>
          <p className="mt-2 text-slate-500">
            Engineered precisely using Razorpay Web Checkout Integration + Supabase RESTful Client hooks safely secured server-side.
          </p>
          <p className="mt-4 text-slate-600">
            &copy; 15-Jun-2026 Elite Traders. All test sandbox rights reserved.
          </p>
        </div>
      </footer>

      {/* SIDEBAR/CART DRAWER TRANSITIONS */}
      <AnimatePresence>
        {cartOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
              className="fixed inset-0 bg-slate-950 z-50 cursor-pointer"
            />

            {/* Slideout Content */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl z-50 p-6 flex flex-col justify-between"
              id="cart-drawer"
            >
              <div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                  <h4 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                    <ShoppingBag className="text-slate-700 w-5 h-5" /> Shopping Drawer
                  </h4>
                  <button 
                    onClick={() => setCartOpen(false)}
                    className="p-1 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    Close <span className="font-mono">&times;</span>
                  </button>
                </div>

                {cartItems.length === 0 ? (
                  <div className="text-center py-24 text-slate-400">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold">Your drawer is empty</p>
                    <p className="text-xs mt-1">Select size and quantity configurations to fill the sandbox.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cartItems.map((item, index) => (
                      <div key={`idx-${item.size}-${index}`} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Size {item.size} • ₹{item.price} each</p>
                          <div className="flex items-center gap-1 border border-slate-200 rounded p-0.5 w-max bg-white mt-2">
                            <button 
                              onClick={() => updateCartQuantity(index, -1)}
                              className="p-0.5 hover:bg-slate-100 rounded text-slate-500 transition cursor-pointer"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <span className="px-2 font-mono text-[10px] font-bold text-slate-800">{item.quantity}</span>
                            <button 
                              onClick={() => updateCartQuantity(index, 1)}
                              className="p-0.5 hover:bg-slate-100 rounded text-slate-500 transition cursor-pointer"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-extrabold text-slate-900">₹{item.price * item.quantity}</p>
                          <button 
                            onClick={() => handleRemoveFromCart(index)}
                            className="text-xs text-rose-500 font-semibold hover:underline mt-2 cursor-pointer inline-block"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="border-t border-slate-100 pt-4 mt-6 flex justify-between items-center">
                      <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400">Estimated Total</span>
                      <span className="text-xl font-bold font-mono text-slate-950">₹{getCartTotal().toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {cartItems.length > 0 && (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setCartOpen(false);
                      scrollToSection("product");
                    }}
                    className="w-full bg-slate-950 text-white font-bold py-3.5 rounded-xl text-center shadow-lg cursor-pointer hover:bg-slate-800 transition active:scale-98"
                  >
                    Proceed to Form Checkout
                  </button>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="w-full bg-transparent text-slate-500 font-semibold text-xs text-center hover:underline cursor-pointer py-1"
                  >
                    Continue Browsing
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
