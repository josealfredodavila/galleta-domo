// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ================================================================
// CSARIEL'S NFT
// ================================================================
// NFT exclusivo del ecosistema Csariel's.
//
// REGLAS DE NEGOCIO:
// - Se obtiene canjeando 12 ES.TOKS (se queman)
// - Tiene 30 días de validez para canjear por un domo físico
// - Soulbound mientras activo (no transferible)
// - Transferible cuando caduca
// - Se quema cuando el usuario canjea por un domo
// - Modificable vía proxy UUPS
// - Pausable para emergencias
//
// INTEGRACIÓN CON EL TOKEN:
// - Llama a `CsarielsToken.quemarPorCanje()` cuando el usuario canjea.
// - El contrato de token autoriza al NFT con el rol NFT_ROLE.
// ================================================================

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// ================================================================
// INTERFAZ DEL TOKEN (para quemar ES.TOKS)
// ================================================================
interface ICsarielsToken {
    function quemarPorCanje(address usuario, uint256 cantidad) external;
    function balanceOf(address usuario) external view returns (uint256);
}

contract CsarielsNFT is
    Initializable,
    ERC721Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using Strings for uint256;

    // ================================================================
    // ROLES
    // ================================================================

    /// @notice Rol para pausar en emergencias
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ================================================================
    // CONSTANTES
    // ================================================================

    /// @notice Costo de canje: 12 ES.TOKS
    uint256 public constant TOKENS_PARA_CANJE = 12 * 10**18;

    /// @notice Días de validez del NFT antes de pasar a conmemorativo
    uint256 public constant DIAS_VALIDEZ = 30;

    /// @notice Segundos totales de validez (30 días)
    uint256 public constant SEGUNDOS_VALIDEZ = DIAS_VALIDEZ * 24 * 60 * 60;

    /// @notice URI base para la metadata
    string public baseURI;

    // ================================================================
    // STORAGE
    // ================================================================

    /// @notice Dirección del contrato de token autorizado
    address public contratoToken;

    /// @notice Dirección del backend que firma autorizaciones de quema
    address public backendSigner;

    /// @notice Contador de NFTs minteados (también es el próximo tokenId)
    uint256 public totalNFTsMinteados;

    /// @notice Contador de NFTs quemados (por canje de domo)
    uint256 public totalNFTsQuemados;

    /// @notice Struct de metadata de cada NFT
    struct InfoNFT {
        address propietarioOriginal;    // Quien canjeó por primera vez
        uint256 fechaCanje;             // Timestamp de creación
        uint256 fechaExpiracion;        // Timestamp en que caduca
        bool quemadoPorDomo;            // Si ya se canjeó por domo físico
    }

    /// @notice Mapping tokenId → InfoNFT
    mapping(uint256 => InfoNFT) public infoNFT;

    /// @notice Nonces usados por usuario (anti-replay de firmas de quema)
    mapping(address => uint256) public nonces;

    // ================================================================
    // EVENTOS
    // ================================================================

    event NFTCanjeado(
        address indexed usuario,
        uint256 indexed tokenId,
        uint256 timestamp,
        uint256 fechaExpiracion
    );

    event NFTQuemadoPorDomo(
        address indexed usuario,
        uint256 indexed tokenId,
        uint256 timestamp
    );

    event BaseURIActualizado(
        string anterior,
        string nuevo,
        uint256 timestamp
    );

    event ContratoTokenActualizado(
        address indexed anterior,
        address indexed nuevo,
        uint256 timestamp
    );

    event BackendSignerActualizado(
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

    /// @notice Hash del tipo EIP-712 para la quema por domo
    bytes32 public constant QUEMAR_TYPEHASH = keccak256(
        "Quemar(address usuario,uint256 tokenId,uint256 nonce,uint256 deadline)"
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
     * @param admin_          Dirección del admin (owner)
     * @param backendSigner_  Dirección del backend autorizado para firmar
     * @param contratoToken_  Dirección del contrato CsarielsToken
     * @param baseURI_        URI base para la metadata
     */
    function initialize(
        address admin_,
        address backendSigner_,
        address contratoToken_,
        string memory baseURI_
    ) external initializer {
        require(admin_ != address(0), "Admin invalido");
        require(backendSigner_ != address(0), "Backend signer invalido");
        require(contratoToken_ != address(0), "Contrato token invalido");

        __ERC721_init("Csariel's NFT", "CSN");
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);

        backendSigner = backendSigner_;
        contratoToken = contratoToken_;
        baseURI = baseURI_;
    }

    // ================================================================
    // FUNCIÓN PRINCIPAL: CANJEAR 12 ES.TOKS POR NFT
    // ================================================================

    /**
     * @notice El usuario canjea 12 ES.TOKS por un NFT.
     * @dev Quema 12 ES.TOKS del usuario y mintea 1 NFT.
     */
    function canjearPorTokens() external nonReentrant whenNotPaused returns (uint256) {
        address usuario = msg.sender;

        // 1. Verificar que el usuario tiene 12 ES.TOKS
        uint256 balanceUsuario = ICsarielsToken(contratoToken).balanceOf(usuario);
        require(balanceUsuario >= TOKENS_PARA_CANJE, "No tienes 12 ES.TOKS suficientes");

        // 2. Quemar los 12 ES.TOKS (llama al contrato del token)
        ICsarielsToken(contratoToken).quemarPorCanje(usuario, TOKENS_PARA_CANJE);

        // 3. Generar nuevo tokenId
        totalNFTsMinteados += 1;
        uint256 nuevoTokenId = totalNFTsMinteados;

        // 4. Mintear el NFT
        _safeMint(usuario, nuevoTokenId);

        // 5. Guardar metadata
        uint256 ahora = block.timestamp;
        uint256 expiracion = ahora + SEGUNDOS_VALIDEZ;

        infoNFT[nuevoTokenId] = InfoNFT({
            propietarioOriginal: usuario,
            fechaCanje: ahora,
            fechaExpiracion: expiracion,
            quemadoPorDomo: false
        });

        emit NFTCanjeado(usuario, nuevoTokenId, ahora, expiracion);

        return nuevoTokenId;
    }

    // ================================================================
    // FUNCIÓN: QUEMAR NFT POR DOMO FÍSICO
    // ================================================================

    /**
     * @notice El usuario quema su NFT cuando va a la tienda a canjearlo por un domo.
     * @dev Requiere firma EIP-712 del backend (autoriza el canje).
     *
     * @param tokenId  ID del NFT a quemar
     * @param deadline Timestamp máximo de validez de la firma
     * @param firma    Firma EIP-712 del backend
     */
    function quemarPorDomo(
        uint256 tokenId,
        uint256 deadline,
        bytes calldata firma
    ) external nonReentrant whenNotPaused {
        address usuario = msg.sender;

        // 1. Verificar que el usuario es dueño del NFT
        require(ownerOf(tokenId) == usuario, "No eres dueno de este NFT");

        // 2. Verificar que el NFT no ha sido quemado por domo antes
        require(!infoNFT[tokenId].quemadoPorDomo, "NFT ya canjeado por domo");

        // 3. Verificar que no ha caducado
        require(
            block.timestamp < infoNFT[tokenId].fechaExpiracion,
            "NFT ya caduco, no vale para canje"
        );

        // 4. Validar firma del backend
        _validarFirmaQuema(usuario, tokenId, deadline, firma);

        // 5. Marcar como quemado por domo
        infoNFT[tokenId].quemadoPorDomo = true;
        totalNFTsQuemados += 1;

        // 6. Quemar el NFT
        _burn(tokenId);

        // 7. Incrementar nonce
        nonces[usuario] += 1;

        emit NFTQuemadoPorDomo(usuario, tokenId, block.timestamp);
    }

    // ================================================================
    // FUNCIONES DE CONSULTA
    // ================================================================

    /**
     * @notice Devuelve si un NFT está activo (no caducado, no quemado).
     */
    function esValido(uint256 tokenId) external view returns (bool) {
        if (infoNFT[tokenId].quemadoPorDomo) return false;
        if (infoNFT[tokenId].fechaCanje == 0) return false;
        return block.timestamp < infoNFT[tokenId].fechaExpiracion;
    }

    /**
     * @notice Devuelve si un NFT ya caducó (está en estado conmemorativo).
     */
    function esConmemorativo(uint256 tokenId) external view returns (bool) {
        if (infoNFT[tokenId].fechaCanje == 0) return false;
        return block.timestamp >= infoNFT[tokenId].fechaExpiracion;
    }

    /**
     * @notice Devuelve los días restantes de validez.
     */
    function diasRestantes(uint256 tokenId) external view returns (uint256) {
        if (infoNFT[tokenId].fechaCanje == 0) return 0;
        if (block.timestamp >= infoNFT[tokenId].fechaExpiracion) return 0;

        uint256 segundosRestantes = infoNFT[tokenId].fechaExpiracion - block.timestamp;
        return segundosRestantes / 24 / 60 / 60;
    }

    /**
     * @notice Devuelve el estado textual del NFT.
     */
    function estadoNFT(uint256 tokenId) external view returns (string memory) {
        if (infoNFT[tokenId].quemadoPorDomo) return "canjeado_por_domo";
        if (infoNFT[tokenId].fechaCanje == 0) return "no_existe";
        if (block.timestamp >= infoNFT[tokenId].fechaExpiracion) return "conmemorativo";
        return "activo";
    }

    /**
     * @notice Devuelve el tokenURI del NFT (dinámico según estado).
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory estado = "activo";

        if (infoNFT[tokenId].fechaCanje > 0 && block.timestamp >= infoNFT[tokenId].fechaExpiracion) {
            estado = "conmemorativo";
        }

        return string(abi.encodePacked(baseURI, tokenId.toString(), "/", estado, ".json"));
    }

    // ================================================================
    // FUNCIONES DE ADMINISTRACIÓN
    // ================================================================

    function setBaseURI(string memory nueva) external onlyRole(DEFAULT_ADMIN_ROLE) {
        string memory anterior = baseURI;
        baseURI = nueva;
        emit BaseURIActualizado(anterior, nueva, block.timestamp);
    }

    function setContratoToken(address nuevo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(nuevo != address(0), "Contrato token invalido");
        address anterior = contratoToken;
        contratoToken = nuevo;
        emit ContratoTokenActualizado(anterior, nuevo, block.timestamp);
    }

    function setBackendSigner(address nuevo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(nuevo != address(0), "Backend signer invalido");
        address anterior = backendSigner;
        backendSigner = nuevo;
        emit BackendSignerActualizado(anterior, nuevo, block.timestamp);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    // ================================================================
    // HELPERS INTERNOS
    // ================================================================

    function _validarFirmaQuema(
        address usuario,
        uint256 tokenId,
        uint256 deadline,
        bytes calldata firma
    ) internal view {
        require(block.timestamp <= deadline, "Firma expirada");

        uint256 nonceActual_ = nonces[usuario];

        bytes32 structHash = keccak256(
            abi.encode(
                QUEMAR_TYPEHASH,
                usuario,
                tokenId,
                nonceActual_,
                deadline
            )
        );

        bytes32 digest = ECDSA.toTypedDataHash(_domainSeparatorV4(), structHash);

        address firmante = ECDSA.recover(digest, firma);

        require(firmante == backendSigner, "Firma invalida");
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
    // OVERRIDES: SOULBOUND MIENTRAS ACTIVO
    // ================================================================
    // Regla: el NFT NO se puede transferir mientras está activo.
    // Solo es transferible cuando caduca (estado conmemorativo).
    // ================================================================

    /**
     * @notice Bloquea transferencias mientras el NFT esté activo.
     * @dev Permitimos mint y burn, bloqueamos transfers.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Si es mint (from == 0) o burn (to == 0), permitir
        if (from != address(0) && to != address(0)) {
            // Es una transferencia
            // Solo permitir si el NFT está caducado
            if (infoNFT[tokenId].fechaCanje > 0) {
                require(
                    block.timestamp >= infoNFT[tokenId].fechaExpiracion,
                    "NFT activo: no se puede transferir"
                );
            }
        }

        return super._update(to, tokenId, auth);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit Upgraded(newImplementation, block.timestamp);
    }

    /**
     * @notice Resuelve conflictos de herencia múltiple.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}