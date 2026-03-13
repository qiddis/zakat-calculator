# 🌙 Zakat Calculator

A modern, feature-rich web application for calculating Islamic Zakat on assets. Built with Flask backend and vanilla JavaScript frontend, providing real-time market prices for stocks, cryptocurrencies, precious metals, and currency conversion.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.12+-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.0+-green.svg)

## 📸 Screenshots

### Main Dashboard
![Zakat Calculator Dashboard](.github/README_IMAGES/dashboard.png)
*Portfolio overview with real-time asset prices and Zakat calculation*

### Asset Management
![Add Asset Dialog](.github/README_IMAGES/add-asset.png)
*Easy-to-use interface for adding various asset types*

### Export Features
![Export Options](.github/README_IMAGES/export.png)
*Export your portfolio to Excel or PDF format*

## ✨ Features

### 📊 Portfolio Management
- **Multiple Asset Types**: Cash, stocks, crypto, gold, silver, real estate, receivables, and debts
- **Real-Time Market Data**: Live prices from Yahoo Finance API
- **Multi-Currency Support**: Automatic currency conversion for accurate calculations
- **Import/Export**: Excel and PDF export capabilities for portfolio management

### 💰 Zakat Calculation
- **Automatic Nisab Calculation**: Based on current gold/silver prices
- **2.5% Zakat Rate**: Standard Islamic calculation
- **Asset Categorization**: Clear breakdown by asset type
- **Instant Updates**: Recalculates as you modify your portfolio

### 🎨 User Interface
- **Modern Design**: Clean, responsive interface with Inter font
- **Dark/Light Themes**: (if implemented)
- **Mobile-Friendly**: Works seamlessly on all devices
- **Intuitive UX**: Easy asset management with add/edit/delete functionality

## 🚀 Quick Start

### Option 1: Run the Executable (Windows)

**Pre-built executable included in this repository!**

1. Download or navigate to `ZakatCalculator.exe` (located in root directory)
2. Double-click to run
3. Browser automatically opens to http://localhost:3000

**That's it!** No Python installation or dependencies required. The executable (~17 MB) includes everything needed.

### Option 2: Run from Source

#### Prerequisites
- Python 3.12 or higher
- pip (Python package manager)

#### Installation

```bash
# Clone the repository
git clone <repository-url>
cd zakat

# Install dependencies
pip install -r requirements.txt

# Run the server
python server.py
```

The application will start at **http://localhost:3000** and automatically open in your default browser.

## 🔧 Building the Executable

To create a standalone executable:

```bash
# Install PyInstaller
pip install pyinstaller

# Build the executable
python -m PyInstaller zakat.spec

# Find the executable in dist/
# dist/ZakatCalculator.exe (~16 MB)
```

The executable includes:
- ✅ Flask web server
- ✅ All frontend assets (HTML, CSS, JS)
- ✅ Automatic browser launcher
- ✅ No Python installation needed for end users

## 📁 Project Structure

```
zakat/
├── ZakatCalculator.exe    # ⭐ Ready-to-run Windows executable
├── server.py              # Flask backend server
├── requirements.txt       # Python dependencies
├── zakat.spec            # PyInstaller configuration
├── public/               # Frontend assets
│   ├── index.html       # Main application page
│   ├── app.js           # Frontend logic
│   └── styles.css       # Application styles
├── samples/              # Demo files
│   └── demo_portfolio.xlsx  # Sample portfolio for testing import
└── README.md            # This file
```

## � Demo Portfolio

A sample Excel file is included at `samples/demo_portfolio.xlsx` to help you get started quickly.

**Included demo data (3 family members):**

| Member | Net Wealth | Zakat Due | Assets |
|--------|-----------|-----------|--------|
| **Father** | €19,804 | €695 | ETFs, Stocks (AMZN, AAPL, NVDA, etc.), Crypto, Gold coins, Cash accounts, Liabilities |
| **Son** | €9,957 | €0 (below Nisab) | ETFs (Gold, Islamic World), Gold & Silver jewels |
| **Mother** | €37,464.74 | €936.62 | Gold ETF, Gold jewelry (750g), Silver jewels, Cash |

**Combined family Zakat: €3,214.67**

**To use:** Launch the app → click **↑ Import** → select `demo_portfolio.xlsx` → explore!

## �🔌 API Endpoints

### Get Single Asset Price
```
GET /api/price/<symbol>?currency=<CURRENCY>
```

### Get Multiple Prices
```
POST /api/prices
{
  "symbols": ["AAPL", "BTC-USD"],
  "currency": "USD"
}
```

### Get Metal Spot Prices
```
GET /api/metal-prices?currency=<CURRENCY>
```

Returns current gold and silver prices per ounce and per gram.

## 🌐 Supported Assets

### 📈 Stocks & ETFs
Any symbol traded on major exchanges (AAPL, GOOGL, TSLA, etc.)

### ₿ Cryptocurrencies
- Bitcoin (BTC-USD)
- Ethereum (ETH-USD)
- And more via Yahoo Finance symbols

### 🪙 Precious Metals
- Gold (GC=F futures)
- Silver (SI=F futures)
- Automatic per-gram conversion

### 💱 Currencies
Any major world currency with automatic FX conversion

## ⚙️ Configuration

### Port Configuration
Edit `server.py` to change the default port:

```python
if __name__ == '__main__':
    port = 3000  # Change this
    # ...
```

### Debug Mode
For development, Flask debug mode is enabled by default. For production deployment, set `debug=False`:

```python
app.run(host='0.0.0.0', port=port, debug=False)
```

## 🛡️ Privacy & Security

- **No Data Collection**: All calculations happen locally
- **No Account Required**: Use immediately without signup
- **Client-Side Storage**: Portfolio data stored in browser (localStorage)
- **Secure API Calls**: Uses HTTPS for market data

## 📋 Requirements

### Runtime Requirements
```
flask>=3.0
requests>=2.31.0
urllib3>=2.0.0
```

### Build Requirements (Optional)
```
pyinstaller>=6.19.0
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Yahoo Finance for providing free market data APIs
- Islamic scholars for Zakat calculation guidelines
- Open source community for tools and libraries

## 💬 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact: [Your contact information]

---

**Made with ❤️ for the Muslim community**
