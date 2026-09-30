// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ================================================================
// CSARIEL'S NFT
// ================================================================
// NFT exclusivo del ecosistema Csariel's.
//
// REGLAS DE NEGOCIO:
// - Se obtiene canjeando 12 ES.TOKS (se queman)
// - El usuario puede acumular y canjear cuantos NFTs quiera
// - Cada NFT tiene su propio reloj de 30 días
// - Soulbound mientras activo (no transferible)
// - Al caducar: conmemorativo, transferible (regalar), no canjeable
// - El usuario paga el gas al canjear y al quemar
// - Modificable vía proxy UUPS
// - Pausable para emergencias
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
    // STORAGE
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
    // CANJEAR 12 ES.TOKS POR NFT
    // ================================================================
    // El usuario (msg.sender) paga el gas.
    // Cada canje genera un tokenId nuevo, con su propio reloj de 30 días.
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
    // QUEMAR NFT POR DOMO FÍSICO
    // ================================================================
    // El usuario (msg.sender) paga el gas. Requiere firma del backend.
    // Solo funciona dentro de los 30 días de validez.
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
    // OVERRIDES
    // ================================================================

    // Soulbound mientras activo. Mint y burn siempre permitidos.
    // Transferencias solo si el NFT ya caducó.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            require(infoNFT[tokenId].fechaCanje > 0, "NFT sin metadata");
            require(
                block.timestamp >= infoNFT[tokenId].fechaExpiracion,
                "NFT activo: no se puede transferir"
            );
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