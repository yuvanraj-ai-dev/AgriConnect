import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';

const PRODUCT_CATEGORIES = [
  'Fertilizer',
  'Bio-Organic Fertilizer',
  'Seeds',
  'Pesticide',
  'Tools & Implements',
  'Other'
];

const MACHINERY_TYPES = [
  'Tractor',
  'Harvester',
  'Power Tiller',
  'Rotavator / Cultivator',
  'Boom Sprayer',
  'Seed Drill',
  'Multi-Crop Thresher',
  'Other Machinery'
];

const COMMON_UNITS = [
  '50kg Bag',
  '25kg Bag',
  '10kg Bag',
  '5kg Bag',
  '1kg Packet',
  '1 Liter Bottle',
  '5 Liter Can',
  '500ml Bottle',
  'Piece / Unit',
  'Quintal'
];

export default function VendorShop({ user, initialTab }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab') || initialTab || 'products';
  const [activeTab, setActiveTab] = useState(activeTabParam);

  const [products, setProducts] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    outOfStockProducts: 0,
    totalMachinery: 0,
    availableMachinery: 0
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Filters & Search
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('ALL');
  const [machinerySearch, setMachinerySearch] = useState('');
  const [machineryTypeFilter, setMachineryTypeFilter] = useState('ALL');
  const [machineryStatusFilter, setMachineryStatusFilter] = useState('ALL');

  // Modals state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    title: '',
    category: 'Fertilizer',
    brand: '',
    description: '',
    price: '',
    unit: '50kg Bag',
    stockQuantity: '',
    safetyWarning: '',
    imageUrl: ''
  });

  const [showMachineryModal, setShowMachineryModal] = useState(false);
  const [editingMachinery, setEditingMachinery] = useState(null);
  const [machineryForm, setMachineryForm] = useState({
    name: '',
    type: 'Tractor',
    dailyRate: '',
    securityDeposit: '0',
    location: '',
    operationalStatus: 'AVAILABLE',
    instantApproval: false,
    specifications: '',
    imageUrl: ''
  });

  // Sync tab with URL query parameter
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [prodsRes, machRes, statsRes] = await Promise.all([
        api.get('/vendor/products'),
        api.get('/vendor/machinery'),
        api.get('/vendor/stats').catch(() => ({ data: null }))
      ]);

      setProducts(prodsRes.data || []);
      setMachinery(machRes.data || []);

      if (statsRes && statsRes.data) {
        setStats(statsRes.data);
      } else {
        // Fallback compute locally if stats endpoint has issue
        const prods = prodsRes.data || [];
        const mach = machRes.data || [];
        setStats({
          totalProducts: prods.length,
          outOfStockProducts: prods.filter(p => p.stockQuantity <= 0).length,
          totalMachinery: mach.length,
          availableMachinery: mach.filter(m => m.operationalStatus === 'AVAILABLE').length
        });
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load shop listings');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  // ==========================================
  // PRODUCT HANDLERS
  // ==========================================
  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductForm({
      title: '',
      category: 'Fertilizer',
      brand: '',
      description: '',
      price: '',
      unit: '50kg Bag',
      stockQuantity: '100',
      safetyWarning: '',
      imageUrl: ''
    });
    setShowProductModal(true);
  };

  const openEditProductModal = (prod) => {
    setEditingProduct(prod);
    setProductForm({
      title: prod.title || '',
      category: prod.category || 'Fertilizer',
      brand: prod.brand || '',
      description: prod.description || '',
      price: prod.price || '',
      unit: prod.unit || '50kg Bag',
      stockQuantity: prod.stockQuantity !== undefined ? String(prod.stockQuantity) : '',
      safetyWarning: prod.safetyWarning || '',
      imageUrl: prod.imageUrl || ''
    });
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    if (!productForm.title || !productForm.price || !productForm.unit) {
      alert('Please fill all required fields (Name, Price, Unit).');
      return;
    }

    try {
      setActionLoading(true);
      if (editingProduct) {
        const res = await api.put(`/vendor/products/${editingProduct.id}`, productForm);
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? res.data : p));
        showNotification('Product updated successfully!');
      } else {
        const res = await api.post('/vendor/products', productForm);
        setProducts(prev => [res.data, ...prev]);
        showNotification('Product listed successfully in your shop!');
      }
      setShowProductModal(false);
      // Refresh stats
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to save product.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProduct = async (id, title) => {
    if (!window.confirm(`Are you sure you want to remove "${title}" from your shop?`)) {
      return;
    }

    try {
      await api.delete(`/vendor/products/${id}`);
      setProducts(prev => prev.filter(p => p.id !== id));
      showNotification(`Product "${title}" removed successfully.`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete product.');
    }
  };

  // ==========================================
  // MACHINERY HANDLERS
  // ==========================================
  const openAddMachineryModal = () => {
    setEditingMachinery(null);
    setMachineryForm({
      name: '',
      type: 'Tractor',
      dailyRate: '',
      securityDeposit: '0',
      location: '',
      operationalStatus: 'AVAILABLE',
      instantApproval: false,
      specifications: '',
      imageUrl: ''
    });
    setShowMachineryModal(true);
  };

  const openEditMachineryModal = (item) => {
    setEditingMachinery(item);
    setMachineryForm({
      name: item.name || '',
      type: item.type || 'Tractor',
      dailyRate: item.dailyRate || '',
      securityDeposit: item.securityDeposit !== undefined ? String(item.securityDeposit) : '0',
      location: item.location || '',
      operationalStatus: item.operationalStatus || 'AVAILABLE',
      instantApproval: Boolean(item.instantApproval),
      specifications: item.specifications || '',
      imageUrl: item.imageUrl || ''
    });
    setShowMachineryModal(true);
  };

  const handleMachinerySubmit = async (e) => {
    e.preventDefault();
    if (!machineryForm.name || !machineryForm.dailyRate || !machineryForm.location) {
      alert('Please fill all required fields (Name, Daily Rate, Location).');
      return;
    }

    try {
      setActionLoading(true);
      if (editingMachinery) {
        const res = await api.put(`/vendor/machinery/${editingMachinery.id}`, machineryForm);
        setMachinery(prev => prev.map(m => m.id === editingMachinery.id ? res.data : m));
        showNotification('Machinery updated successfully!');
      } else {
        const res = await api.post('/vendor/machinery', machineryForm);
        setMachinery(prev => [res.data, ...prev]);
        showNotification('Rental machinery listed successfully!');
      }
      setShowMachineryModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to save machinery listing.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleMachineryStatus = async (item) => {
    const newStatus = item.operationalStatus === 'AVAILABLE' ? 'UNDER_MAINTENANCE' : 'AVAILABLE';
    try {
      const res = await api.put(`/vendor/machinery/${item.id}`, { operationalStatus: newStatus });
      setMachinery(prev => prev.map(m => m.id === item.id ? res.data : m));
      showNotification(`Status updated to ${newStatus.replace('_', ' ')}.`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    }
  };

  const handleDeleteMachinery = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove rental machinery "${name}"?`)) {
      return;
    }

    try {
      await api.delete(`/vendor/machinery/${id}`);
      setMachinery(prev => prev.filter(m => m.id !== id));
      showNotification(`Machinery "${name}" removed successfully.`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete machinery.');
    }
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesCategory = productCategoryFilter === 'ALL' || p.category === productCategoryFilter;
    const matchesSearch = productSearch === '' || 
      p.title?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.brand?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.description?.toLowerCase().includes(productSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filter machinery
  const filteredMachinery = machinery.filter(m => {
    const matchesType = machineryTypeFilter === 'ALL' || m.type === machineryTypeFilter;
    const matchesStatus = machineryStatusFilter === 'ALL' || m.operationalStatus === machineryStatusFilter;
    const matchesSearch = machinerySearch === '' ||
      m.name?.toLowerCase().includes(machinerySearch.toLowerCase()) ||
      m.location?.toLowerCase().includes(machinerySearch.toLowerCase()) ||
      m.specifications?.toLowerCase().includes(machinerySearch.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  return (
    <div className="max-w-6xl mx-auto mt-6 pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3 border-b border-agriBorder pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/dashboard" className="text-agriGreen hover:underline font-medium">
              &larr; Dashboard
            </Link>
            <span>/</span>
            <span className="text-gray-700">Vendor Management</span>
          </div>
          <h2 className="text-2xl font-bold text-agriText flex items-center gap-2">
            <span>🏪</span> My Shop & Equipment
          </h2>
          <p className="text-sm text-gray-500">
            List and manage your agricultural products (fertilizers, seeds, inputs) and rental machinery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'products' ? (
            <button
              onClick={openAddProductModal}
              className="bg-agriGreen text-white px-4 py-2.5 rounded-lg font-medium hover:bg-opacity-90 flex items-center gap-2 shadow-sm transition"
            >
              <span>➕</span> Add Product (Fertilizer/Input)
            </button>
          ) : (
            <button
              onClick={openAddMachineryModal}
              className="bg-agriGreen text-white px-4 py-2.5 rounded-lg font-medium hover:bg-opacity-90 flex items-center gap-2 shadow-sm transition"
            >
              <span>🚜</span> Add Rental Machinery
            </button>
          )}
        </div>
      </div>

      {/* Notification Toast */}
      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-medium text-sm">{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-green-700 hover:text-green-900 font-bold">&times;</button>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="font-medium text-sm">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 font-bold">&times;</button>
        </div>
      )}

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-agriBorder shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Products Listed</div>
          <div className="text-2xl font-bold text-agriGreen">{stats.totalProducts}</div>
          <div className="text-xs text-gray-400 mt-1">Fertilizers, seeds & tools</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-agriBorder shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Low / Out of Stock</div>
          <div className={`text-2xl font-bold ${stats.outOfStockProducts > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
            {stats.outOfStockProducts}
          </div>
          <div className="text-xs text-gray-400 mt-1">Requires restock attention</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-agriBorder shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Machinery Fleet</div>
          <div className="text-2xl font-bold text-agriGreen">{stats.totalMachinery}</div>
          <div className="text-xs text-gray-400 mt-1">Total machines for rental</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-agriBorder shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Ready for Rent</div>
          <div className="text-2xl font-bold text-blue-600">{stats.availableMachinery}</div>
          <div className="text-xs text-gray-400 mt-1">Active & available now</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-agriBorder mb-6 bg-white rounded-t-lg px-2 pt-2">
        <button
          onClick={() => handleTabChange('products')}
          className={`flex items-center gap-2 py-3 px-6 font-semibold border-b-2 text-sm transition-colors ${
            activeTab === 'products'
              ? 'border-agriGreen text-agriGreen bg-green-50/50 rounded-t-lg'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>🌾</span>
          <span>Fertilizers & Farm Products ({products.length})</span>
        </button>

        <button
          onClick={() => handleTabChange('machinery')}
          className={`flex items-center gap-2 py-3 px-6 font-semibold border-b-2 text-sm transition-colors ${
            activeTab === 'machinery'
              ? 'border-agriGreen text-agriGreen bg-green-50/50 rounded-t-lg'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>🚜</span>
          <span>Rental Machinery & Equipment ({machinery.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: FERTILIZERS & AGRICULTURAL INPUTS                 */}
      {/* ======================================================== */}
      {activeTab === 'products' && (
        <div>
          {/* Controls bar */}
          <div className="bg-white p-4 rounded-xl border border-agriBorder shadow-sm mb-6 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex-1 flex items-center bg-gray-50 border border-agriBorder rounded-lg px-3 py-1.5 focus-within:border-agriGreen">
              <span className="text-gray-400 mr-2">🔍</span>
              <input
                type="text"
                placeholder="Search fertilizer name, brand (e.g. Urea, IFFCO, NPK)..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="bg-transparent w-full text-sm outline-none text-agriText"
              />
              {productSearch && (
                <button onClick={() => setProductSearch('')} className="text-gray-400 hover:text-gray-600 text-xs">Clear</button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Category:</span>
              <select
                value={productCategoryFilter}
                onChange={e => setProductCategoryFilter(e.target.value)}
                className="p-2 border border-agriBorder rounded-lg text-sm bg-white focus:outline-none focus:border-agriGreen"
              >
                <option value="ALL">All Categories</option>
                {PRODUCT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-agriBorder">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-agriGreen border-t-transparent rounded-full mb-2"></div>
              <div>Loading product inventory...</div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300">
              <div className="text-4xl mb-3">🌱</div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                {productSearch || productCategoryFilter !== 'ALL' ? 'No products match your filters' : 'No agricultural products listed yet'}
              </h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                Start adding your fertilizers (Urea, DAP, NPK, Potash), seeds, bio-nutrients, and farming supplies to reach local farmers.
              </p>
              <button
                onClick={openAddProductModal}
                className="bg-agriGreen text-white px-5 py-2.5 rounded-lg font-medium hover:bg-opacity-90 inline-flex items-center gap-2 shadow-sm"
              >
                <span>➕</span> Add Your First Product
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map(prod => (
                <div
                  key={prod.id}
                  className="bg-white border border-agriBorder rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Image / Header Banner */}
                    <div className="h-40 bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center relative border-b border-agriBorder overflow-hidden">
                      {prod.imageUrl ? (
                        <img
                          src={prod.imageUrl}
                          alt={prod.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <span className="text-5xl select-none">
                          {prod.category === 'Fertilizer' || prod.category === 'Bio-Organic Fertilizer' ? '🌾' :
                           prod.category === 'Seeds' ? '🌱' :
                           prod.category === 'Pesticide' ? '🧪' : '🛠️'}
                        </span>
                      )}

                      {/* Category Badge */}
                      <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-agriGreen text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm border border-green-200">
                        {prod.category}
                      </span>

                      {/* Stock Badge */}
                      <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${
                        prod.stockQuantity > 10
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : prod.stockQuantity > 0
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}>
                        {prod.stockQuantity > 0 ? `${prod.stockQuantity} in stock` : 'Out of stock'}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      {prod.brand && (
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                          {prod.brand}
                        </div>
                      )}
                      <h4 className="text-lg font-bold text-agriText mb-2 leading-snug">
                        {prod.title}
                      </h4>

                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-2xl font-extrabold text-agriGreen">
                          ₹{prod.price.toLocaleString()}
                        </span>
                        <span className="text-sm font-medium text-gray-500">
                          / {prod.unit}
                        </span>
                      </div>

                      {prod.description && (
                        <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                          {prod.description}
                        </p>
                      )}

                      {/* Safety Warning Notice (BR-MK-02) */}
                      {prod.safetyWarning && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 mb-3 flex items-start gap-2">
                          <span className="text-amber-600 flex-shrink-0">⚠️</span>
                          <div>
                            <span className="font-semibold">Safety Instruction: </span>
                            {prod.safetyWarning}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="px-5 py-3.5 bg-gray-50 border-t border-agriBorder flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      Added {new Date(prod.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditProductModal(prod)}
                        className="px-3 py-1.5 text-xs font-medium text-agriGreen bg-white border border-agriGreen/40 rounded hover:bg-green-50 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id, prod.title)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: RENTAL MACHINERY & EQUIPMENT                      */}
      {/* ======================================================== */}
      {activeTab === 'machinery' && (
        <div>
          {/* Controls bar */}
          <div className="bg-white p-4 rounded-xl border border-agriBorder shadow-sm mb-6 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex-1 flex items-center bg-gray-50 border border-agriBorder rounded-lg px-3 py-1.5 focus-within:border-agriGreen">
              <span className="text-gray-400 mr-2">🔍</span>
              <input
                type="text"
                placeholder="Search machinery name, model, location (e.g. Mahindra Tractor, Harvester)..."
                value={machinerySearch}
                onChange={e => setMachinerySearch(e.target.value)}
                className="bg-transparent w-full text-sm outline-none text-agriText"
              />
              {machinerySearch && (
                <button onClick={() => setMachinerySearch('')} className="text-gray-400 hover:text-gray-600 text-xs">Clear</button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={machineryTypeFilter}
                onChange={e => setMachineryTypeFilter(e.target.value)}
                className="p-2 border border-agriBorder rounded-lg text-sm bg-white focus:outline-none focus:border-agriGreen"
              >
                <option value="ALL">All Machinery Types</option>
                {MACHINERY_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={machineryStatusFilter}
                onChange={e => setMachineryStatusFilter(e.target.value)}
                className="p-2 border border-agriBorder rounded-lg text-sm bg-white focus:outline-none focus:border-agriGreen"
              >
                <option value="ALL">All Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                <option value="RENTED">Currently Rented</option>
              </select>
            </div>
          </div>

          {/* Machinery Grid */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-agriBorder">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-agriGreen border-t-transparent rounded-full mb-2"></div>
              <div>Loading machinery fleet...</div>
            </div>
          ) : filteredMachinery.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300">
              <div className="text-4xl mb-3">🚜</div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                {machinerySearch || machineryTypeFilter !== 'ALL' || machineryStatusFilter !== 'ALL'
                  ? 'No machinery matches your filters'
                  : 'No rental machinery listed yet'}
              </h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                List your tractors, combine harvesters, power tillers, rotavators, and sprayers for short-term farm rentals to earn daily revenue.
              </p>
              <button
                onClick={openAddMachineryModal}
                className="bg-agriGreen text-white px-5 py-2.5 rounded-lg font-medium hover:bg-opacity-90 inline-flex items-center gap-2 shadow-sm"
              >
                <span>🚜</span> Add Your First Machine
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMachinery.map(item => (
                <div
                  key={item.id}
                  className="bg-white border border-agriBorder rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Image / Header Banner */}
                    <div className="h-44 bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center relative border-b border-agriBorder overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <span className="text-6xl select-none">🚜</span>
                      )}

                      {/* Type Badge */}
                      <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm border border-gray-200">
                        {item.type}
                      </span>

                      {/* Status Badge */}
                      <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${
                        item.operationalStatus === 'AVAILABLE'
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : item.operationalStatus === 'UNDER_MAINTENANCE'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}>
                        ● {item.operationalStatus.replace('_', ' ')}
                      </span>

                      {/* Instant Approval Badge */}
                      {item.instantApproval && (
                        <span className="absolute bottom-2 left-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                          ⚡ Instant Auto-Approval
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <div className="flex items-center text-xs text-gray-500 mb-1">
                        <span className="mr-1">📍</span>
                        <span className="font-medium text-gray-700">{item.location}</span>
                      </div>

                      <h4 className="text-lg font-bold text-agriText mb-2 leading-snug">
                        {item.name}
                      </h4>

                      {/* Pricing block */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-gray-500 font-medium">Daily Rental Rate:</span>
                          <div>
                            <span className="text-xl font-extrabold text-agriGreen">
                              ₹{item.dailyRate.toLocaleString()}
                            </span>
                            <span className="text-xs text-gray-500"> / day</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-600 pt-1 border-t border-gray-200">
                          <span>Security Deposit:</span>
                          <span className="font-semibold text-gray-800">
                            {item.securityDeposit > 0 ? `₹${item.securityDeposit.toLocaleString()}` : 'None'}
                          </span>
                        </div>
                      </div>

                      {/* Specifications */}
                      {item.specifications && (
                        <div className="text-xs text-gray-600 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 mb-2">
                          <span className="font-bold text-gray-700">Specs / Details: </span>
                          <span>{item.specifications}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="px-5 py-3.5 bg-gray-50 border-t border-agriBorder flex items-center justify-between">
                    <button
                      onClick={() => handleToggleMachineryStatus(item)}
                      className="text-xs font-medium text-gray-600 hover:text-agriGreen underline"
                      title="Quick toggle availability"
                    >
                      {item.operationalStatus === 'AVAILABLE' ? 'Set to Maintenance' : 'Set to Available'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditMachineryModal(item)}
                        className="px-3 py-1.5 text-xs font-medium text-agriGreen bg-white border border-agriGreen/40 rounded hover:bg-green-50 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMachinery(item.id, item.name)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD / EDIT PRODUCT (FERTILIZERS & INPUTS)          */}
      {/* ======================================================== */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-agriBorder max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="text-xl font-bold text-agriGreen flex items-center gap-2">
                <span>🌾</span> {editingProduct ? 'Edit Product Listing' : 'Add New Agricultural Product / Fertilizer'}
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Product Name / Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IFFCO Urea 46% Nitrogen, Organic NPK 19-19-19"
                  value={productForm.title}
                  onChange={e => setProductForm({ ...productForm, title: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={productForm.category}
                    onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm bg-white focus:border-agriGreen focus:outline-none"
                  >
                    {PRODUCT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. IFFCO, Coromandel, Bayer, Tata Rallis"
                    value={productForm.brand}
                    onChange={e => setProductForm({ ...productForm, brand: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="e.g. 266.50"
                    value={productForm.price}
                    onChange={e => setProductForm({ ...productForm, price: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Packaging Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={productForm.unit}
                    onChange={e => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm bg-white focus:border-agriGreen focus:outline-none"
                  >
                    {COMMON_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Stock Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="e.g. 50"
                    value={productForm.stockQuantity}
                    onChange={e => setProductForm({ ...productForm, stockQuantity: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Safety Warning / Handling Precautions (BR-MK-02)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Keep away from direct sunlight and children. Wear gloves during application."
                  value={productForm.safetyWarning}
                  onChange={e => setProductForm({ ...productForm, safetyWarning: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Crucial for fertilizers and chemical pesticides to ensure farmer safety.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Product Description & Composition
                </label>
                <textarea
                  rows="3"
                  placeholder="Composition details, nutrient ratio (e.g. N:P:K 19:19:19), recommended crops and application dose..."
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/fertilizer-bag.jpg"
                  value={productForm.imageUrl}
                  onChange={e => setProductForm({ ...productForm, imageUrl: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-agriBorder">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-agriGreen text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add to Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD / EDIT RENTAL MACHINERY                       */}
      {/* ======================================================== */}
      {showMachineryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-agriBorder max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="text-xl font-bold text-agriGreen flex items-center gap-2">
                <span>🚜</span> {editingMachinery ? 'Edit Rental Machinery' : 'Add Rental Machinery / Equipment'}
              </h3>
              <button
                onClick={() => setShowMachineryModal(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleMachinerySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Machinery Name / Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mahindra 575 DI 45 HP Tractor, Kubota Combine Harvester DC-68G"
                  value={machineryForm.name}
                  onChange={e => setMachineryForm({ ...machineryForm, name: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Machinery Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={machineryForm.type}
                    onChange={e => setMachineryForm({ ...machineryForm, type: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm bg-white focus:border-agriGreen focus:outline-none"
                  >
                    {MACHINERY_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Operational Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={machineryForm.operationalStatus}
                    onChange={e => setMachineryForm({ ...machineryForm, operationalStatus: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm bg-white focus:border-agriGreen focus:outline-none"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                    <option value="RENTED">Currently Rented</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Daily Rental Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 1500 (per day / 8 hours)"
                    value={machineryForm.dailyRate}
                    onChange={e => setMachineryForm({ ...machineryForm, dailyRate: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">Min. rental duration: 1 day (BR-EQ-01)</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Security Deposit (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 2000 (0 if none)"
                    value={machineryForm.securityDeposit}
                    onChange={e => setMachineryForm({ ...machineryForm, securityDeposit: e.target.value })}
                    className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">Refundable deposit upon machine return</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Location / Base Village & District <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Guntur District, Andhra Pradesh"
                  value={machineryForm.location}
                  onChange={e => setMachineryForm({ ...machineryForm, location: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Specifications & Operating Terms
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. 50 HP Engine, 4WD, Includes Rotavator and Trolley, Driver provided, Fuel to be supplied by farmer"
                  value={machineryForm.specifications}
                  onChange={e => setMachineryForm({ ...machineryForm, specifications: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Machinery Photo URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/tractor.jpg"
                  value={machineryForm.imageUrl}
                  onChange={e => setMachineryForm({ ...machineryForm, imageUrl: e.target.value })}
                  className="w-full p-2.5 border border-agriBorder rounded-lg text-sm focus:border-agriGreen focus:outline-none"
                />
              </div>

              {/* Instant Auto-Approval Checkbox (REQ-EQ-01, REQ-EQ-10) */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={machineryForm.instantApproval}
                    onChange={e => setMachineryForm({ ...machineryForm, instantApproval: e.target.checked })}
                    className="w-4 h-4 text-agriGreen rounded mt-0.5 focus:ring-agriGreen"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800">
                      ⚡ Enable Instant Auto-Approval (REQ-EQ-10)
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Automatically confirm farmer rental requests without waiting for manual approval whenever selected dates are open.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-agriBorder">
                <button
                  type="button"
                  onClick={() => setShowMachineryModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-agriGreen text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : editingMachinery ? 'Save Changes' : 'List Machinery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
