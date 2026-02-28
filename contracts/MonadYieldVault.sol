// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MonadYieldVault
 * @notice Monad Testnet üzerinde çalışan basit yield vault kontratı.
 *         Kullanıcılar MON yatırır, sembolik yield kazanır,
 *         ödeme yapabilir ve kalan bakiyeyi ana cüzdana süpürebilir.
 */
contract MonadYieldVault {
    struct DepositInfo {
        uint256 amount;
        uint256 depositTime;
    }

    mapping(address => DepositInfo) public deposits;

    // ─── Events ───────────────────────────────────────────────
    event Deposit(address indexed user, uint256 amount, uint256 timestamp);
    event Payment(address indexed from, address indexed to, uint256 amount);
    event Sweep(address indexed user, address indexed mainWallet, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────
    modifier hasBalance() {
        require(deposits[msg.sender].amount > 0, "No deposited balance");
        _;
    }

    /**
     * @notice MON yatırma fonksiyonu.
     *         msg.value kadar MON kontrata yatırılır.
     */
    function deposit() external payable {
        require(msg.value > 0, "Must deposit more than 0");

        DepositInfo storage info = deposits[msg.sender];

        if (info.amount > 0) {
            // Mevcut bakiyeye yield ekle ve sıfırla
            uint256 currentWithYield = _calculateBalanceWithYield(msg.sender);
            info.amount = currentWithYield + msg.value;
        } else {
            info.amount = msg.value;
        }

        info.depositTime = block.timestamp;

        emit Deposit(msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Yatırılan miktar + yield hesaplayarak döner.
     *         Yield oranı: saniyede %0.00001 (1e-7 / saniye)
     *         Formül: balance + (balance * elapsed * RATE_NUMERATOR) / RATE_DENOMINATOR
     *         RATE_NUMERATOR = 1, RATE_DENOMINATOR = 1e7 (saniyede 1e-7 oran)
     * @param user Bakiyesi sorgulanacak kullanıcı adresi
     * @return Yield dahil toplam bakiye (wei cinsinden)
     */
    function getBalanceWithYield(address user) external view returns (uint256) {
        return _calculateBalanceWithYield(user);
    }

    /**
     * @notice Belirlenen miktarı hedef adrese gönderir (NFC ödeme).
     *         Kullanıcının bakiyesinden düşülür.
     * @param target Ödeme hedefi (NFC ile gelen adres)
     * @param amount Gönderilecek miktar (wei cinsinden)
     */
    function executePayment(address payable target, uint256 amount) external hasBalance {
        uint256 currentBalance = _calculateBalanceWithYield(msg.sender);
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= currentBalance, "Insufficient balance");

        // Bakiyeyi güncelle
        deposits[msg.sender].amount = currentBalance - amount;
        deposits[msg.sender].depositTime = block.timestamp;

        // MON transferi
        (bool success, ) = target.call{value: amount}("");
        require(success, "Payment transfer failed");

        emit Payment(msg.sender, target, amount);
    }

    /**
     * @notice Kalan tüm bakiyeyi (yield dahil) ana cüzdana süpürür.
     * @param mainWallet Süpürülecek ana cüzdan adresi (MetaMask)
     */
    function sweep(address payable mainWallet) external hasBalance {
        uint256 totalBalance = _calculateBalanceWithYield(msg.sender);

        // Bakiyeyi sıfırla
        deposits[msg.sender].amount = 0;
        deposits[msg.sender].depositTime = 0;

        // Tüm MON'u ana cüzdana gönder
        (bool success, ) = mainWallet.call{value: totalBalance}("");
        require(success, "Sweep transfer failed");

        emit Sweep(msg.sender, mainWallet, totalBalance);
    }

    /**
     * @dev Internal yield hesaplama fonksiyonu.
     *      Saniyede %0.00001 = 1e-7 oran
     *      yield = balance * elapsed / 10_000_000
     */
    function _calculateBalanceWithYield(address user) internal view returns (uint256) {
        DepositInfo storage info = deposits[user];

        if (info.amount == 0) {
            return 0;
        }

        uint256 elapsed = block.timestamp - info.depositTime;

        if (elapsed == 0) {
            return info.amount;
        }

        // yield = amount * elapsed / 10^7
        // Bu, saniyede %0.00001 (1e-7) oranına karşılık gelir
        uint256 yieldAmount = (info.amount * elapsed) / 10_000_000;

        return info.amount + yieldAmount;
    }

    /**
     * @notice Kontratın toplam MON bakiyesini döner.
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Kontratın direkt MON alabilmesi için
    receive() external payable {}
}
