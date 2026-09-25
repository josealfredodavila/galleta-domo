// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ================================================================
// CSARIEL'S TOKEN (ES.TOKS / GAL)
// ================================================================
// Token ERC-20 del ecosistema Csariel's.
//
// REGLAS DE NEGOCIO:
// - Supply máximo: 1,000,000 ES.TOKS (cap duro, no modificable)
// - Minteo solo con firma EIP-712 del backend (gas pagado por el backend)
// - 1 QR físico = 1 ES.TOKS (un QR solo se canjea una vez)
// - Comisión 3% solo en el Muro P2P (transferencias normales son libres)
// - Compatible con MetaMask, DEX, exchanges (ERC-20 estándar)
// - Modificable vía proxy UUPS
// - Pausable para emergencias
//
// MODELO DE GAS:
// - reclamarTokens: el BACKEND (MINTER_ROLE) paga el gas y mintea a
//   la wallet del usuario indicada en `usuarioReceptor`. El usuario
//   no necesita MATIC ni firmar nada.
// - venderEnMuro: el VENDEDOR interactúa directo desde su wallet
//   (msg.sender) y paga su propio gas. Sin firma EIP-712, sin relay.
//
// INTEGRACIÓN CON NFT:
// - El contrato del NFT puede llamar a `quemarPorCanje()`
//   para quemar 12 ES.TOKS cuando el usuario canjea por un NFT.
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

    /// @notice Rol para mintear tokens (backend que paga el gas del reclamo QR)
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Rol para pausar en emergencias
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Rol para quemar ES.TOKS en nombre de un usuario (contrato NFT)
    bytes32 public constant NFT_ROLE = keccak256("NFT_ROLE");

    // ================================================================
    // CONSTANTES
    // ================================================================

    /// @notice Supply máximo: 1,000,000 ES.TOKS (con 18 decimales)
    uint256 public constant MAX_SUPPLY = 1_000_000 * 10**18;

    /// @notice Comisión del Muro P2P: 3% (basis points)
    /// 100 basis points = 1%
    uint256 public constant COMISION_MURO_BPS = 300;

    /// @notice Basis points totales (100%)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Tiempo de validez de las firmas del backend (5 minutos)
    uint256 public constant FIRMA_VALIDEZ_SEGUNDOS = 5 * 60;

    // ================================================================
    // STORAGE
    // ================================================================

    /// @notice Dirección del backend autorizado para firmar
    address public backendSigner;

    /// @notice Wallet que recibe las comisiones del Muro P2P
    address public walletComisiones;

    /// @notice Dirección del contrato de NFT autorizado
    address public contratoNFT;

    /// @notice Registro de QRs usados (1 QR = 1 ES.TOKS)
    mapping(uint256 => bool) public qrUsado;

    /// @notice Nonces usados por usuario (anti-replay de firmas de reclamo)
    mapping(address => uint256) public nonces;

    /// @notice Total de QRs canjeados (estadística)
    uint256 public totalQrCanjeados;

    /// @notice Total de comisiones generadas (histórico)
    uint256 public totalComisionesGeneradas;

    /// @notice Total de tokens quemados por canje de NFT (histórico)
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

    event Upgraded(
        address indexed nuevaImplementacion,
        uint256 timestamp
    );

    // ================================================================
    // TIPO EIP-712
    // ================================================================

    /// @notice Hash del tipo EIP-712 para el reclamo de tokens.
    /// El backend firma: (usuarioReceptor, qrId, cantidad, nonce, deadline).
    /// El `nonce` es el del `usuarioReceptor`, no el del backend.
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

    /**
     * @notice Inicializa el contrato.
     * @param admin_            Dirección del admin (owner)
     * @param backendSigner_    Dirección del backend autorizado para firmar
     * @param walletComisiones_ Dirección que recibe las comisiones del Muro
     */
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

        // Asignar roles al admin
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);

        // El backend tiene MINTER_ROLE (paga el gas de los reclamos QR)
        _grantRole(MINTER_ROLE, backendSigner_);

        backendSigner = backendSigner_;
        walletComisiones = walletComisiones_;
        contratoNFT = address(0);
    }

    // ================================================================
    // FUNCIÓN PRINCIPAL: RECLAMAR ES.TOKS CON QR (BACKEND PAGA GAS)
    // ================================================================

    /**
     * @notice El backend mintea 1 ES.TOKS a la wallet del usuario tras
     * escanear un QR físico.
     * @dev El BACKEND (MINTER_ROLE) paga el gas. El usuario no necesita
     * MATIC ni firmar nada. La firma EIP-712 del backend garantiza que
     * el QR fue validado off-chain antes de mintear.
     *
     * @param usuarioReceptor  Dirección que recibe los tokens (wallet del usuario)
     * @param qrId             ID del QR físico (único, 1 QR = 1 ES.TOKS)
     * @param cantidad         Cantidad de tokens a mintear
     * @param deadline         Timestamp máximo de validez de la firma
     * @param firma            Firma EIP-712 del backend autorizando el claim
     */
    function reclamarTokens(
        address usuarioReceptor,
        uint256 qrId,
        uint256 cantidad,
        uint256 deadline,
        bytes calldata firma
    ) external nonReentrant whenNotPaused onlyRole(MINTER_ROLE) {
        require(usuarioReceptor != address(0), "Usuario receptor invalido");
        require(cantidad > 0, "Cantidad debe ser mayor a 0");
        require(block.timestamp <= deadline, "Firma expirada");
        require(!qrUsado[qrId], "QR ya usado");

        // Validar que no exceda el cap
        require(totalSupply() + cantidad <= MAX_SUPPLY, "Cap maximo alcanzado");

        // Validar firma del backend para el usuario receptor
        _validarFirma(usuarioReceptor, qrId, cantidad, deadline, firma);

        // Marcar QR como usado
        qrUsado[qrId] = true;
        totalQrCanjeados += 1;

        // Incrementar nonce del receptor (anti-replay)
        nonces[usuarioReceptor] += 1;

        // Mintear tokens al usuario receptor
        _mint(usuarioReceptor, cantidad);

        emit QRUsado(qrId, usuarioReceptor, block.timestamp);
        emit TokensMinteados(usuarioReceptor, qrId, cantidad, block.timestamp);
    }

    // ================================================================
    // FUNCIÓN: VENDER EN MURO P2P (VENDEDOR PAGA GAS)
    // ================================================================

    /**
     * @notice El vendedor ejecuta una venta directa desde su wallet.
     * @dev Aplica comisión del 3% al vendedor. El vendedor (msg.sender)
     * paga su propio gas. Sin firma EIP-712 ni relay.
     *
     * ⚠️ Aviso: esta función asume que el vendedor ya coordinó off-chain
     * el pago con el comprador. La transferencia de tokens y la comisión
     * son inmediatas e irreversibles en el momento de la llamada.
     *
     * @param comprador  Dirección del comprador
     * @param monto      Monto total de ES.TOKS a transferir
     */
    function venderEnMuro(
        address comprador,
        uint256 monto
    ) external nonReentrant whenNotPaused {
        address vendedor = msg.sender;

        require(comprador != address(0), "Comprador invalido");
        require(vendedor != comprador, "No puedes venderte a ti mismo");
        require(monto > 0, "Monto debe ser mayor a 0");
        require(balanceOf(vendedor) >= monto, "Vendedor sin saldo");

        // Calcular comisión
        uint256 comision = (monto * COMISION_MURO_BPS) / BPS_DENOMINATOR;
        uint256 montoComprador = monto - comision;

        require(comision > 0, "Comision demasiado baja");

        // 1. Comisión al wallet de comisiones
        _transfer(vendedor, walletComisiones, comision);

        // 2. Monto neto al comprador
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
    // FUNCIÓN: QUEMAR TOKENS POR CANJE DE NFT
    // ================================================================

    /**
     * @notice Quema ES.TOKS del usuario cuando canjea por un NFT.
     * @dev Solo el contrato de NFT (NFT_ROLE) puede llamar.
     *
     * @param usuario  Usuario cuyos tokens se queman
     * @param cantidad Cantidad de tokens a quemar
     */
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
    // FUNCIONES DE ADMINISTRACIÓN
    // ================================================================

    /**
     * @notice Cambia la wallet que recibe las comisiones del Muro.
     */
    function setWalletComisiones(address nueva)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(nueva != address(0), "Wallet invalida");
        address anterior = walletComisiones;
        walletComisiones = nueva;
        emit WalletComisionesActualizada(anterior, nueva, block.timestamp);
    }

    /**
     * @notice Cambia la dirección del backend que firma autorizaciones.
     */
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

    /**
     * @notice Configura la dirección del contrato de NFT autorizado.
     */
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

    /**
     * @notice Pausa el contrato (emergencias).
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Reanuda el contrato.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ================================================================
    // FUNCIONES DE CONSULTA
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

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit Upgraded(newImplementation, block.timestamp);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable)
        whenNotPaused
    {
        super._update(from, to, value);
    }
}