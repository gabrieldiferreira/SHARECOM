# Finwave Dashboard Implementation - Quick Start Guide

## ✅ Already Implemented

### 1. Complete Design System
- **CSS Variables**: All design tokens in `globals.css`
- **Component Classes**: Hero cards, metric cards, transaction rows, FABs, progress bars, tag pills, bottom nav
- **Animation System**: Hover effects, button press, page transitions, chart stagger, progress fill, FAB pulse
- **Responsive Utilities**: Fluid typography with clamp(), touch optimization, safe area handling

### 2. Core Components Ready
All component classes are available in `globals.css`:
- `.hero-balance-card` - Full-width gradient card with floating orbs
- `.metric-card` - Metric display with sparkline area
- `.category-card` - Category breakdown with icon
- `.transaction-row` - Transaction list item
- `.merchant-logo` - 40px circle for merchant icons
- `.glass-card` - Standard glassmorphic card
- `.glass-input` - Form input with glass effect
- `.btn-primary` - Purple-pink gradient button
- `.btn-secondary` - Outlined button
- `.fab` - Floating action button
- `.progress-bar` / `.progress-fill` - Progress indicators
- `.tag-pill` - Removable tag chips
- `.bottom-tab-bar` / `.tab-button` - Mobile navigation

### 3. Responsive System Active
- Tailwind config updated with breakpoints (xs/sm/md/lg/xl/2xl)
- Container queries plugin installed
- Fluid typography utilities (`.text-fluid-hero`, `.text-fluid-h1`, etc.)
- Touch optimization classes (`.touch-manipulation`)
- Safe area CSS variables

## 🚀 How to Use the Design System

### Example 1: Hero Balance Card
```tsx
<div className="hero-balance-card">
  <div className="relative z-10 flex flex-col items-center py-8 text-center">
    <span className="text-[12px] font-semibold opacity-50 uppercase tracking-widest mb-3">
      Total Balance
    </span>
    <div className="text-[48px] font-black tracking-tight leading-none tabular-nums">
      <span className="text-white">R$ {Math.floor(balance).toLocaleString('pt-BR')}</span>
      <span className="opacity-50">,{(balance % 1).toFixed(2).substring(2)}</span>
    </div>
    <div className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-[12px] font-semibold backdrop-blur-md text-green-500">
      <TrendingUp size={14} />
      <span>+R$ 234.50 hoje</span>
    </div>
  </div>

  {/* Mini Accounts Carousel */}
  <div className="relative z-10 mt-6 -mx-6 px-6 overflow-x-auto no-scrollbar snap-x snap-mandatory flex gap-3 pb-2">
    {accounts.map((acc, i) => (
      <div key={i} className="snap-center shrink-0 w-[160px] p-4 rounded-2xl bg-white/5 border border-white/8 backdrop-blur-md flex flex-col hover:-translate-y-1 transition-transform cursor-pointer group">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: acc.color }}></div>
            <span className="text-[12px] font-bold opacity-70">{acc.name}</span>
          </div>
          <Settings size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <span className="text-[16px] font-bold tabular-nums">R$ {acc.balance.toLocaleString('pt-BR')}</span>
        <span className="text-[10px] opacity-50 font-mono mt-1">{acc.masked_number}</span>
      </div>
    ))}
  </div>
</div>
```

### Example 2: Metric Card with Sparkline
```tsx
<div className="metric-card">
  <div className="flex justify-between items-start">
    <span className="text-[14px] opacity-70">Receitas</span>
    <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
      <TrendingUp size={12} />
      <span>+12%</span>
    </div>
  </div>
  
  <span className="text-[32px] font-semibold tabular-nums">R$ 4.567,00</span>
  
  <div className="h-[60px] w-full opacity-40 group-hover:opacity-100 transition-opacity">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={growthData}>
        <defs>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.5}/>
            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} fill="url(#gradIncome)" />
      </AreaChart>
    </ResponsiveContainer>
  </div>
</div>
```

### Example 3: Category Breakdown Card
```tsx
<div className="category-card">
  <div className="flex items-center gap-3">
    <div className="category-icon" style={{ background: '#FB923C' }}>
      <Coffee size={20} />
    </div>
    <div>
      <p className="text-[14px] font-semibold">Alimentação</p>
      <p className="text-[12px] opacity-50">R$ 1.234,56</p>
    </div>
  </div>
  
  <div className="text-right">
    <p className="text-[18px] font-bold tabular-nums">30%</p>
    <div className="w-16 h-1.5 bg-black/20 rounded-full overflow-hidden mt-1.5">
      <div 
        className="h-full rounded-full animate-fill-progress" 
        style={{ width: '30%', background: '#FB923C' }}
      ></div>
    </div>
  </div>
</div>
```

### Example 4: Transaction Row
```tsx
<div className="transaction-row group">
  <div className="merchant-logo">
    <Coffee size={20} className="text-orange-500" />
  </div>
  
  <div className="flex-1 min-w-0">
    <p className="text-[14px] font-medium truncate">Starbucks Coffee</p>
    <p className="text-[12px] opacity-50 truncate">Hoje às 14:30</p>
  </div>
  
  <div className="hidden sm:block">
    <span className="text-[11px] opacity-50">Alimentação</span>
  </div>
  
  <div className="text-right">
    <p className="text-[16px] font-semibold text-white tabular-nums">-R$ 6,80</p>
  </div>
  
  <button className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
    <MoreVertical size={16} />
  </button>
</div>
```

### Example 5: Spending Chart
```tsx
<div className="glass-card-static p-6">
  <div className="flex justify-between items-center mb-6">
    <h2 className="text-[16px] font-semibold">Gastos por Hora</h2>
    <div className="px-3 py-1.5 rounded-full bg-orange-500/20 text-orange-500 text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-orange-500/30 transition-colors">
      <Calendar size={12} />
      <span>Este Mês</span>
      <X size={10} className="opacity-60" />
    </div>
  </div>
  
  <div className="h-[300px] w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={hourlyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis 
          dataKey="hour" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} 
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} 
          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#0D0D12', 
            borderColor: 'rgba(255,255,255,0.08)', 
            borderRadius: '12px', 
            fontSize: '12px', 
            color: '#fff' 
          }} 
          cursor={{ fill: 'rgba(139,92,246,0.08)' }}
        />
        <Bar dataKey="value" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>
```

### Example 6: Progress Bar (Goals)
```tsx
<div className="glass-card p-5 cursor-pointer border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-[14px] font-semibold">MacBook Pro M3</h3>
    <span className="text-[11px] font-bold text-cyan-500 tabular-nums">45%</span>
  </div>
  
  <p className="text-[12px] opacity-50 mb-4">Meta: R$ 18.000</p>
  
  <div className="progress-bar mb-2">
    <div 
      className="progress-fill" 
      style={{ 
        width: '45%',
        background: 'linear-gradient(135deg, #06B6D4, #8B5CF6)'
      }}
    ></div>
  </div>
  
  <div className="flex justify-between text-[11px] font-medium">
    <span className="tabular-nums">R$ 8.100 economizado</span>
    <span className="opacity-50">Prazo: Dez 2026</span>
  </div>
</div>
```

### Example 7: Floating Action Button
```tsx
<button className="fab pulse" onClick={handleAddTransaction}>
  <Plus size={24} />
</button>
```

### Example 8: Bottom Tab Bar (Mobile)
```tsx
<div className="bottom-tab-bar">
  {[
    { id: 'home', label: 'Início', icon: <Home size={24} /> },
    { id: 'analytics', label: 'Análises', icon: <PieChart size={24} /> },
    { id: 'goals', label: 'Metas', icon: <Target size={24} /> },
    { id: 'settings', label: 'Config', icon: <Settings size={24} /> }
  ].map((tab) => (
    <button 
      key={tab.id}
      className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.icon}
      <span className="text-[10px] font-medium">{tab.label}</span>
    </button>
  ))}
</div>
```

### Example 9: Tag Pills
```tsx
<div className="flex flex-wrap gap-2">
  {tags.map((tag, i) => (
    <div key={i} className="tag-pill">
      <span>{tag}</span>
      <button 
        onClick={() => removeTag(tag)}
        className="hover:text-red-500 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  ))}
</div>
```

### Example 10: Form Inputs
```tsx
<div className="space-y-4">
  <div>
    <label className="block text-[12px] opacity-50 mb-2 font-medium uppercase tracking-wider">
      Nome da Meta
    </label>
    <input 
      type="text" 
      className="glass-input" 
      placeholder="Ex: MacBook Pro M3"
    />
  </div>
  
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-[12px] opacity-50 mb-2 font-medium uppercase tracking-wider">
        Valor Alvo (R$)
      </label>
      <input 
        type="number" 
        className="glass-input" 
        placeholder="18000"
      />
    </div>
    <div>
      <label className="block text-[12px] opacity-50 mb-2 font-medium uppercase tracking-wider">
        Prazo
      </label>
      <input 
        type="date" 
        className="glass-input [color-scheme:dark]"
      />
    </div>
  </div>
  
  <div className="flex gap-3 pt-4">
    <button className="btn-secondary flex-1">Cancelar</button>
    <button className="btn-primary flex-1">Salvar Meta</button>
  </div>
</div>
```

## 📱 Responsive Grid Layouts

### Mobile (Single Column)
```tsx
<div className="space-y-4">
  <div className="hero-balance-card">...</div>
  <div className="metric-card">...</div>
  <div className="metric-card">...</div>
  <div className="glass-card-static">...</div>
</div>
```

### Tablet (2 Columns)
```tsx
<div className="space-y-6">
  <div className="hero-balance-card">...</div>
  <div className="grid grid-cols-2 gap-6">
    <div className="metric-card">...</div>
    <div className="metric-card">...</div>
    <div className="metric-card">...</div>
    <div className="metric-card">...</div>
  </div>
  <div className="glass-card-static">...</div>
</div>
```

### Desktop (3-4 Columns)
```tsx
<div className="grid grid-cols-12 gap-6">
  {/* Sidebar */}
  <div className="col-span-2 space-y-4">
    <div className="glass-card">...</div>
  </div>
  
  {/* Main Content */}
  <div className="col-span-7 space-y-6">
    <div className="hero-balance-card">...</div>
    <div className="grid grid-cols-4 gap-4">
      <div className="metric-card">...</div>
      <div className="metric-card">...</div>
      <div className="metric-card">...</div>
      <div className="metric-card">...</div>
    </div>
    <div className="glass-card-static">...</div>
  </div>
  
  {/* Insights Panel */}
  <div className="col-span-3 space-y-4">
    <div className="glass-card">...</div>
  </div>
</div>
```

## 🎨 Color Palette Quick Reference

```tsx
// Category Colors
const CATEGORY_COLORS = {
  eatingOut: '#FB923C',   // Orange
  groceries: '#06B6D4',   // Cyan
  transport: '#8B5CF6',   // Purple
  home: '#EC4899',        // Pink
  health: '#10B981',      // Green
  education: '#F59E0B',   // Amber
  leisure: '#14B8A6',     // Teal
  others: '#6B7280',      // Gray
};

// Usage
<div className="category-icon" style={{ background: CATEGORY_COLORS.eatingOut }}>
  <Coffee size={20} />
</div>
```

## 🎭 Animation Classes

```tsx
// Stagger children animation
<div className="stagger-children">
  <div>Item 1</div> {/* 0ms delay */}
  <div>Item 2</div> {/* 50ms delay */}
  <div>Item 3</div> {/* 100ms delay */}
</div>

// Bar chart stagger
<div className="bar-stagger">
  <div>Bar 1</div>
  <div>Bar 2</div>
  <div>Bar 3</div>
</div>

// Individual animations
<div className="animate-fade-in-up">Fades in from bottom</div>
<div className="animate-slide-in-right">Slides in from right</div>
<div className="animate-scale-in">Scales in</div>
<div className="animate-fill-progress">Progress bar fill</div>
<div className="animate-pulse-glow">Pulsing glow effect</div>
```

## 🔧 Utility Classes

```tsx
// Touch optimization
<button className="touch-manipulation">Button</button>

// Fluid typography
<h1 className="text-fluid-hero">Hero Text</h1>
<h2 className="text-fluid-h1">Heading 1</h2>
<p className="text-fluid-body">Body text</p>

// Skeleton loaders
<div className="skeleton h-8 w-32"></div>
<div className="skeleton-glass h-24 w-full"></div>

// Scroll snap
<div className="overflow-x-auto snap-x snap-mandatory">
  <div className="snap-center">Item 1</div>
  <div className="snap-center">Item 2</div>
</div>
```

## 📊 Chart Configuration Template

```tsx
const chartConfig = {
  margin: { top: 10, right: 0, left: -20, bottom: 0 },
  cartesianGrid: {
    strokeDasharray: "3 3",
    vertical: false,
    stroke: "rgba(255,255,255,0.05)"
  },
  xAxis: {
    axisLine: false,
    tickLine: false,
    tick: { fontSize: 10, fill: 'rgba(255,255,255,0.4)' }
  },
  yAxis: {
    axisLine: false,
    tickLine: false,
    tick: { fontSize: 10, fill: 'rgba(255,255,255,0.4)' }
  },
  tooltip: {
    contentStyle: {
      backgroundColor: '#0D0D12',
      borderColor: 'rgba(255,255,255,0.08)',
      borderRadius: '12px',
      fontSize: '12px',
      color: '#fff'
    }
  }
};
```

## 🚀 Next Steps

1. **Apply to existing components**: Replace current styling with Finwave classes
2. **Add missing dashboards**: Implement Goals and Statistics screens
3. **Enhance animations**: Add Framer Motion for complex transitions
4. **Optimize performance**: Implement virtualization for long lists
5. **Add haptic feedback**: Integrate Capacitor Haptics plugin
6. **Test responsiveness**: Verify on iPhone 14 Pro, iPad Pro, MacBook Pro

All the design system infrastructure is ready - just apply the classes to your components! 🎨✨
