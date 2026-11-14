// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ================================================================
// CSARIEL'S NFT · PROPUESTA v1.1.0 (PARA REVISIÓN Y TESTNET)
// ================================================================
// NO DESPLEGAR DIRECTO EN MAINNET. Probar primero en Polygon Amoy.
//
// CAMBIOS RESPECTO A v1.0.0 (marcados con [v1.1]):
//   1. approve() y setApprovalForAll() revierten: ningún marketplace
//      puede listar el NFT para venta.
//   2. transferFrom() y safeTransferFrom() revierten: el NFT solo se
//      mueve mediante regalar().
//   3. regalar(destinatario, tokenId): solo después de los 30 días
//      de vigencia (cuando ya está caducado) y solo si no fue canjeado.
//   4. Variable nueva _transferAutorizada al FINAL del storage: es
//      compatible con el proxy UUPS ya desplegado (no mueve slots).
//   5. version() devuelve "1.1.0".
//
// LO QUE ESTE CONTRATO NO PUEDE IMPEDIR (límite técnico):
//   - Que alguien regale el NFT a cambio de dinero FUERA de la
//     blockchain. La regla "no vender" se cumple en el contrato
//     (no hay venta on-chain posible) y en la app (sin listado).
//
// REGLAS (según el negocio):
//   - Días 0 a 30: congelado. No se puede transferir, regalar ni vender.
//   - Día 31 en adelante: se puede regalar (gratis) a otro usuario.
//   - Nunca se puede vender en el mercado.
//   - Se puede canjear por domo solo mientras esté activo (día 0 a 30),
//     con firma del backend (quemarPorDomo).
// ================================================================

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ================================================================
    // CONSTANTES
    // ================================================================

    uint256 public constant TOKENS_PARA_CANJE = 12 * 10**18;
    uint256 public constant DIAS_VALIDEZ = 30;
    uint256 public constant SEGUNDOS_VALIDEZ = DIAS_VALIDEZ * 24 * 60 * 60;

    // ================================================================
    // STORAGE (no cambiar el orden de estas variables: es el proxy vivo)
    // ================================================================

    string public baseURI;
    address public contratoToken;
    address public backendSigner;
    uint256 public totalNFTsMinteados;
    uint256 public totalNFTsQuemados;

    struct InfoNFT {
        address propietarioOriginal;
        uint256 fechaCanje;
        uint256 fechaExpiracion;
        bool quemadoPorDomo;
    }

    mapping(uint256 => InfoNFT) public infoNFT;
    mapping(address => uint256) public nonces;

    // [v1.1] Se agrega AL FINAL del storage para compatibilidad UUPS.
    bool private _transferAutorizada;

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

    // [v1.1]
    event NFTRegalado(
        address indexed de,
        address indexed para,
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

    // ================================================================
    // EIP-712
    // ================================================================

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
    // CANJEAR 12 ES.TOKS POR NFT (sin cambios)
    // ================================================================

    function canjearPorTokens() external nonReentrant whenNotPaused returns (uint256) {
        address usuario = msg.sender;

        require(contratoToken != address(0), "Contrato token no configurado");

        uint256 balanceUsuario = ICsarielsToken(contratoToken).balanceOf(usuario);
        require(balanceUsuario >= TOKENS_PARA_CANJE, "No tienes 12 ES.TOKS suficientes");

        uint256 nuevoTokenId = totalNFTsMinteados + 1;
        uint256 ahora = block.timestamp;
        uint256 expiracion = ahora + SEGUNDOS_VALIDEZ;

        infoNFT[nuevoTokenId] = InfoNFT({
            propietarioOriginal: usuario,
            fechaCanje: ahora,
            fechaExpiracion: expiracion,
            quemadoPorDomo: false
        });
        totalNFTsMinteados = nuevoTokenId;

        ICsarielsToken(contratoToken).quemarPorCanje(usuario, TOKENS_PARA_CANJE);
        _safeMint(usuario, nuevoTokenId);

        emit NFTCanjeado(usuario, nuevoTokenId, ahora, expiracion);

        return nuevoTokenId;
    }

    // ================================================================
    // [v1.1] REGALAR (solo después de 30 días, nunca vender)
    // ================================================================

    function regalar(address destinatario, uint256 tokenId)
        external
        nonReentrant
        whenNotPaused
    {
        address de = msg.sender;

        require(ownerOf(tokenId) == de, "No eres dueno de este NFT");
        require(destinatario != address(0), "Destinatario invalido");
        require(destinatario != de, "No puedes regalartelo a ti mismo");

        InfoNFT storage info = infoNFT[tokenId];
        require(info.fechaCanje > 0, "NFT no existe");
        require(!info.quemadoPorDomo, "NFT ya canjeado por domo");
        require(
            block.timestamp >= info.fechaExpiracion,
            "Congelado: se puede regalar solo despues de 30 dias"
        );

        _transferAutorizada = true;
        _transfer(de, destinatario, tokenId);
        _transferAutorizada = false;

        emit NFTRegalado(de, destinatario, tokenId, block.timestamp);
    }

    // ================================================================
    // QUEMAR NFT POR DOMO FÍSICO (sin cambios)
    // ================================================================

    function quemarPorDomo(
        uint256 tokenId,
        uint256 deadline,
        bytes calldata firma
    ) external nonReentrant whenNotPaused {
        address usuario = msg.sender;

        require(infoNFT[tokenId].fechaCanje > 0, "NFT no existe");
        require(!infoNFT[tokenId].quemadoPorDomo, "NFT ya canjeado por domo");
        require(ownerOf(tokenId) == usuario, "No eres dueno de este NFT");
        require(
            block.timestamp < infoNFT[tokenId].fechaExpiracion,
            "NFT ya caduco, no vale para canje"
        );

        _validarFirmaQuema(usuario, tokenId, deadline, firma);

        nonces[usuario] += 1;
        infoNFT[tokenId].quemadoPorDomo = true;
        totalNFTsQuemados += 1;

        _burn(tokenId);

        emit NFTQuemadoPorDomo(usuario, tokenId, block.timestamp);
    }

    // ================================================================
    // [v1.1] BLOQUEO DE VENTA EN MERCADOS
    // ================================================================
    // Sin aprobaciones, ningún marketplace puede listar el NFT.

    function approve(address, uint256) public pure override {
        revert("Venta deshabilitada: los NFT no se pueden vender");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("Venta deshabilitada: los NFT no se pueden vender");
    }

    // ================================================================
    // CONSULTAS
    // ================================================================

    function esValido(uint256 tokenId) external view returns (bool) {
        if (infoNFT[tokenId].quemadoPorDomo) return false;
        if (infoNFT[tokenId].fechaCanje == 0) return false;
        return block.timestamp < infoNFT[tokenId].fechaExpiracion;
    }

    function esConmemorativo(uint256 tokenId) external view returns (bool) {
        if (infoNFT[tokenId].fechaCanje == 0) return false;
        if (infoNFT[tokenId].quemadoPorDomo) return false;
        return block.timestamp >= infoNFT[tokenId].fechaExpiracion;
    }

    function diasRestantes(uint256 tokenId) external view returns (uint256) {
        if (infoNFT[tokenId].fechaCanje == 0) return 0;
        if (block.timestamp >= infoNFT[tokenId].fechaExpiracion) return 0;

        uint256 segundosRestantes = infoNFT[tokenId].fechaExpiracion - block.timestamp;
        return segundosRestantes / 24 / 60 / 60;
    }

    function estadoNFT(uint256 tokenId) external view returns (string memory) {
        if (infoNFT[tokenId].quemadoPorDomo) return "canjeado_por_domo";
        if (infoNFT[tokenId].fechaCanje == 0) return "no_existe";
        if (block.timestamp >= infoNFT[tokenId].fechaExpiracion) return "conmemorativo";
        return "activo";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory estado = "activo";

        if (infoNFT[tokenId].fechaCanje > 0 && block.timestamp >= infoNFT[tokenId].fechaExpiracion) {
            estado = "conmemorativo";
        }

        return string(abi.encodePacked(baseURI, tokenId.toString(), "/", estado, ".json"));
    }

    // ================================================================
    // ADMINISTRACIÓN
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
        return "1.1.0";
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
    // OVERRIDES
    // ================================================================

    // [v1.1] Mint y burn permitidos. Transferencias SOLO vía regalar().
    // transferFrom y safeTransferFrom quedan bloqueados.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            require(_transferAutorizada, "Solo se permite regalar, no transferir libremente");
            require(infoNFT[tokenId].fechaCanje > 0, "NFT sin metadata");
        }

        return super._update(to, tokenId, auth);
    }

    function _authorizeUpgrade(address)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}