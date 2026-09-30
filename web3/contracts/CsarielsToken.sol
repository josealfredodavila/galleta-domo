// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ================================================================
// CSARIEL'S TOKEN (ES.TOKS / GAL)
// ================================================================
// Token ERC-20 del ecosistema Csariel's.
//
// REGLAS DE NEGOCIO:
// - Supply máximo: 1,000,000 ES.TOKS (cap duro)
// - 1 QR físico = 1 ES.TOKS (un QR se canjea una sola vez)
// - El backend paga el gas al reclamar tokens (gasless para el cliente)
// - El cliente puede vender ES.TOKS en el Muro P2P (comisión 3%)
// - El contrato NFT puede quemar 12 ES.TOKS al canjear un NFT
// - Modificable vía proxy UUPS
// - Pausable para emergencias
// ================================================================

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract CsarielsToken is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ================================================================
    // ROLES
    // ================================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant NFT_ROLE = keccak256("NFT_ROLE");

    // ================================================================
    // CONSTANTES
    // ================================================================

    uint256 public constant MAX_SUPPLY = 1_000_000 * 10**18;
    uint256 public constant COMISION_MURO_BPS = 300;      // 3%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ================================================================
    // STORAGE
    // ================================================================

    address public backendSigner;
    address public walletComisiones;
    address public contratoNFT;

    mapping(uint256 => bool) public qrUsado;
    mapping(address => uint256) public nonces;

    uint256 public totalQrCanjeados;
    uint256 public totalComisionesGeneradas;
    uint256 public totalTokensQuemadosPorNFT;

    // ================================================================
    // EVENTOS
    // ================================================================

    event TokensMinteados(
        address indexed usuario,
        uint256 indexed qrId,
        uint256 cantidad,
        uint256 timestamp
    );

    event QRUsado(
        uint256 indexed qrId,
        address indexed usuario,
        uint256 timestamp
    );

    event VentaMuro(
        address indexed vendedor,
        address indexed comprador,
        uint256 montoTotal,
        uint256 montoComprador,
        uint256 comision,
        uint256 timestamp
    );

    event TokensQuemadosPorCanje(
        address indexed usuario,
        uint256 cantidad,
        uint256 timestamp
    );

    event BackendSignerActualizado(
        address indexed anterior,
        address indexed nuevo,
        uint256 timestamp
    );

    event WalletComisionesActualizada(
        address indexed anterior,
        address indexed nueva,
        uint256 timestamp
    );

    event ContratoNFTActualizado(
        address indexed anterior,
        address indexed nuevo,
        uint256 timestamp
    );

    // ================================================================
    // EIP-712
    // ================================================================

    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address usuario,uint256 qrId,uint256 cantidad,uint256 nonce,uint256 deadline)"
    );

    // ================================================================
    // CONSTRUCTOR / INITIALIZER
    // ================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin_,
        address backendSigner_,
        address walletComisiones_
    ) external initializer {
        require(admin_ != address(0), "Admin invalido");
        require(backendSigner_ != address(0), "Backend signer invalido");
        require(walletComisiones_ != address(0), "Wallet comisiones invalida");

        __ERC20_init("Csariel's Token", "GAL");
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
        _grantRole(MINTER_ROLE, backendSigner_);

        backendSigner = backendSigner_;
        walletComisiones = walletComisiones_;
        contratoNFT = address(0);
    }

    // ================================================================
    // RECLAMAR TOKENS CON QR
    // ================================================================
    // El backend paga el gas. El cliente recibe los tokens en su wallet
    // sin gastar MATIC.
    // ================================================================

    function reclamarTokens(
        address usuario,
        uint256 qrId,
        uint256 cantidad,
        uint256 deadline,
        bytes calldata firma
    ) external nonReentrant whenNotPaused onlyRole(MINTER_ROLE) {
        require(usuario != address(0), "Usuario receptor invalido");
        require(cantidad > 0, "Cantidad debe ser mayor a 0");
        require(block.timestamp <= deadline, "Firma expirada");
        require(!qrUsado[qrId], "QR ya usado");
        require(totalSupply() + cantidad <= MAX_SUPPLY, "Cap maximo alcanzado");

        _validarFirma(usuario, qrId, cantidad, deadline, firma);

        qrUsado[qrId] = true;
        totalQrCanjeados += 1;
        nonces[usuario] += 1;

        _mint(usuario, cantidad);

        emit QRUsado(qrId, usuario, block.timestamp);
        emit TokensMinteados(usuario, qrId, cantidad, block.timestamp);
    }

    // ================================================================
    // VENDER EN MURO P2P
    // ================================================================
    // El vendedor (msg.sender) paga el gas. Comisión 3% al admin.
    // ================================================================

    function venderEnMuro(address comprador, uint256 monto)
        external
        nonReentrant
        whenNotPaused
    {
        address vendedor = msg.sender;

        require(comprador != address(0), "Comprador invalido");
        require(vendedor != comprador, "No puedes venderte a ti mismo");
        require(monto > 0, "Monto debe ser mayor a 0");
        require(balanceOf(vendedor) >= monto, "Vendedor sin saldo");

        uint256 comision = (monto * COMISION_MURO_BPS) / BPS_DENOMINATOR;
        uint256 montoComprador = monto - comision;

        require(comision > 0, "Comision demasiado baja");

        _transfer(vendedor, walletComisiones, comision);
        _transfer(vendedor, comprador, montoComprador);

        totalComisionesGeneradas += comision;

        emit VentaMuro(
            vendedor,
            comprador,
            monto,
            montoComprador,
            comision,
            block.timestamp
        );
    }

    // ================================================================
    // QUEMAR POR CANJE DE NFT
    // ================================================================
    // Solo el contrato NFT puede llamar (NFT_ROLE).
    // ================================================================

    function quemarPorCanje(address usuario, uint256 cantidad)
        external
        nonReentrant
        whenNotPaused
        onlyRole(NFT_ROLE)
    {
        require(usuario != address(0), "Usuario invalido");
        require(cantidad > 0, "Cantidad debe ser mayor a 0");
        require(balanceOf(usuario) >= cantidad, "Usuario sin saldo suficiente");

        _burn(usuario, cantidad);

        totalTokensQuemadosPorNFT += cantidad;

        emit TokensQuemadosPorCanje(usuario, cantidad, block.timestamp);
    }

    // ================================================================
    // ADMINISTRACIÓN
    // ================================================================

    function setWalletComisiones(address nueva)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(nueva != address(0), "Wallet invalida");
        address anterior = walletComisiones;
        walletComisiones = nueva;
        emit WalletComisionesActualizada(anterior, nueva, block.timestamp);
    }

    function setBackendSigner(address nuevo)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(nuevo != address(0), "Backend signer invalido");

        address anterior = backendSigner;

        if (anterior != address(0)) {
            _revokeRole(MINTER_ROLE, anterior);
        }

        _grantRole(MINTER_ROLE, nuevo);
        backendSigner = nuevo;

        emit BackendSignerActualizado(anterior, nuevo, block.timestamp);
    }

    function setContratoNFT(address nuevo)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(nuevo != address(0), "Contrato NFT invalido");

        address anterior = contratoNFT;

        if (anterior != address(0)) {
            _revokeRole(NFT_ROLE, anterior);
        }

        _grantRole(NFT_ROLE, nuevo);
        contratoNFT = nuevo;

        emit ContratoNFTActualizado(anterior, nuevo, block.timestamp);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ================================================================
    // CONSULTAS
    // ================================================================

    function qrYaUsado(uint256 qrId) external view returns (bool) {
        return qrUsado[qrId];
    }

    function nonceActual(address usuario) external view returns (uint256) {
        return nonces[usuario];
    }

    function supplyRestante() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function claimTypehash() external pure returns (bytes32) {
        return CLAIM_TYPEHASH;
    }

    // ================================================================
    // HELPERS INTERNOS
    // ================================================================

    function _validarFirma(
        address usuario,
        uint256 qrId,
        uint256 cantidad,
        uint256 deadline,
        bytes calldata firma
    ) internal view {
        uint256 nonceActual_ = nonces[usuario];

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                usuario,
                qrId,
                cantidad,
                nonceActual_,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address firmante = ECDSA.recover(digest, firma);

        require(
            firmante == backendSigner,
            "Firma invalida o firmante incorrecto"
        );
    }

    function _hashTypedDataV4(bytes32 structHash)
        internal
        view
        returns (bytes32)
    {
        return ECDSA.toTypedDataHash(_domainSeparatorV4(), structHash);
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                    ),
                    keccak256(bytes(name())),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(this)
                )
            );
    }

    // ================================================================
    // OVERRIDES
    // ================================================================

    function _authorizeUpgrade(address)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable)
        whenNotPaused
    {
        super._update(from, to, value);
    }
}