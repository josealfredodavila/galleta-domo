// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Sariel's Ecosystem Smart Contract
 * @author Sariel's Team
 * @notice Sistema de fidelización Web3 para Sariel's (Puebla, México)
 * 
 * FLUJO COMPLETO:
 * 1. Cliente compra domo físico → escanea QR → recibe 1 Regalito
 * 2. Al acumular exactamente 12 Regalitos → mintea un NFT (Domo)
 * 3. NFT tiene 30 días para canjear (quemar) por un domo gratis
 * 4. Si NO se canjea en 30 días → NFT se convierte en Soulbound (no transferible)
 * 5. NFT conmemorativo: solo coleccionable, pierde valor comercial
 * 6. Mercado P2P con comisión del 2% para el proyecto
 */
contract SarielsEcosystem is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // ================================================================
    // CONSTANTES Y CONFIGURACIÓN
    // ================================================================

    uint256 public constant TOKENS_NEEDED_FOR_NFT = 12;
    uint256 public constant CANJE_WINDOW_DAYS = 30;
    uint256 public constant CANJE_WINDOW_SECONDS = CANJE_WINDOW_DAYS * 24 * 3600;
    uint256 public constant MARKETPLACE_FEE_PERCENT = 200; // 2% (base 10000)
    uint256 public constant FEE_DENOMINATOR = 10000;

    // ================================================================
    // ESTADO DE NFT
    // ================================================================

    struct NFTInfo {
        uint256 mintedAt;
        uint256 canjeadoEn;
        bool isSoulbound;
        bool fueCanjeado;
        string metadataURI;
    }

    struct Listing {
        uint256 tokenId;
        address seller;
        uint256 price;
        bool isActive;
    }

    mapping(uint256 => NFTInfo) public nftInfo;
    mapping(address => uint256) public regalitosBalance;
    mapping(address => bool) public isAuthorizedScanner;
    mapping(uint256 => Listing) public listings;
    mapping(address => uint256) public accumulatedFees; // Para retiro de comisiones

    uint256 public totalNFTsMinted;
    IERC20 public regalitosToken;
    address public physicalStoreAddress;
    string public soulboundMetadataURI; // URI del listón conmemorativo

    // ================================================================
    // EVENTOS
    // ================================================================

    event RegalitosEmitidos(address indexed usuario, uint256 cantidad, uint256 nuevoTotal);
    event NFTMinted(address indexed usuario, uint256 indexed tokenId);
    event NFTCanjeado(address indexed usuario, uint256 indexed tokenId, uint256 timestamp);
    event NFTConvertedToSoulbound(uint256 indexed tokenId, uint256 timestamp);
    event RegalitosQuemados(address indexed usuario, uint256 cantidad);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    // ================================================================
    // MODIFICADORES
    // ================================================================

    modifier soloPropietarioNFT(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "No eres el propietario del NFT");
        _;
    }

    modifier soloEscannerAutorizado() {
        require(isAuthorizedScanner[msg.sender] || msg.sender == owner(), "No autorizado para escanear");
        _;
    }

    modifier nftNoCanjeado(uint256 tokenId) {
        require(!nftInfo[tokenId].fueCanjeado, "Este NFT ya fue canjeado");
        _;
    }

    modifier nftEnVentanaCanje(uint256 tokenId) {
        uint256 tiempoTranscurrido = block.timestamp - nftInfo[tokenId].mintedAt;
        require(tiempoTranscurrido < CANJE_WINDOW_SECONDS, "El NFT ya expiro");
        _;
    }

    modifier listingExists(uint256 tokenId) {
        require(listings[tokenId].isActive, "El NFT no esta listado");
        _;
    }

    modifier listingSeller(uint256 tokenId) {
        require(listings[tokenId].seller == msg.sender, "No eres el vendedor");
        _;
    }

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    constructor(
        string memory name,
        string memory symbol,
        address _regalitosTokenAddress,
        address _physicalStoreAddress,
        string memory _soulboundMetadataURI
    ) ERC721(name, symbol) Ownable(msg.sender) {
        require(_regalitosTokenAddress != address(0), "Token Regalitos invalido");
        require(_physicalStoreAddress != address(0), "Direccion del local invalida");

        regalitosToken = IERC20(_regalitosTokenAddress);
        physicalStoreAddress = _physicalStoreAddress;
        soulboundMetadataURI = _soulboundMetadataURI;

        isAuthorizedScanner[msg.sender] = true;
    }

    // ================================================================
    // FUNCIONES PARA EMITIR REGALITOS (Escáner QR)
    // ================================================================

    function emitirRegalitos(address usuario, uint256 cantidad) external soloEscannerAutorizado nonReentrant {
        require(usuario != address(0), "Direccion invalida");
        require(cantidad > 0, "Cantidad debe ser mayor a 0");

        regalitosBalance[usuario] += cantidad;

        emit RegalitosEmitidos(usuario, cantidad, regalitosBalance[usuario]);
    }

    function getRegalitosBalance(address usuario) external view returns (uint256) {
        return regalitosBalance[usuario];
    }

    // ================================================================
    // FUNCIONES PARA MINTEAR NFT
    // ================================================================

    function mintNFT(string memory tokenURI) external nonReentrant {
        require(regalitosBalance[msg.sender] >= TOKENS_NEEDED_FOR_NFT, "No tienes suficientes Regalitos");
        require(bytes(tokenURI).length > 0, "URI no puede estar vacia");

        regalitosBalance[msg.sender] -= TOKENS_NEEDED_FOR_NFT;
        emit RegalitosQuemados(msg.sender, TOKENS_NEEDED_FOR_NFT);

        totalNFTsMinted++;
        uint256 newTokenId = totalNFTsMinted;

        _safeMint(msg.sender, newTokenId);

        nftInfo[newTokenId] = NFTInfo({
            mintedAt: block.timestamp,
            canjeadoEn: 0,
            isSoulbound: false,
            fueCanjeado: false,
            metadataURI: tokenURI
        });

        emit NFTMinted(msg.sender, newTokenId);
    }

    // ================================================================
    // CANJE FÍSICO (BURN) - CON VALIDACIÓN DE AUTORIZACIÓN
    // ================================================================

    function canjearNFTPorGalleta(uint256 tokenId) 
        external 
        nonReentrant 
        nftNoCanjeado(tokenId) 
        nftEnVentanaCanje(tokenId) 
    {
        // ✅ Validar que quien ejecuta sea el dueño del NFT o la tienda física autorizada
        require(ownerOf(tokenId) == msg.sender || msg.sender == physicalStoreAddress || isAuthorizedScanner[msg.sender], "No autorizado para canjear");

        address infoOwner = ownerOf(tokenId);

        // Actualizar estados antes de quemar (Prevención de ataques de reentrada)
        nftInfo[tokenId].fueCanjeado = true;
        nftInfo[tokenId].canjeadoEn = block.timestamp;

        // Cancelar listado en el mercado P2P si estaba activo al canjear
        if (listings[tokenId].isActive) {
            listings[tokenId].isActive = false;
            emit ListingCancelled(tokenId, listings[tokenId].seller);
        }

        // Quemar el NFT permanentemente
        _burn(tokenId);

        emit NFTCanjeado(infoOwner, tokenId, block.timestamp);
    }

    // ================================================================
    // CONTROL SOULBOUND AUTOMÁTICO (Override de Transferencias)
    // ================================================================

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        // Ignorar la regla de los 30 días si el token se está minteando o quemando
        if (fromOf(tokenId) != address(0) && to != address(0)) {
            // Verificar si el tiempo expiró
            if (block.timestamp - nftInfo[tokenId].mintedAt >= CANJE_WINDOW_SECONDS) {
                nftInfo[tokenId].isSoulbound = true;
                revert("El NFT ha caducado (30 dias cumplidos). Ahora es un activo Soulbound intransferible");
            }
            
            // Si está listado en el P2P, removerlo activamente al transferirse de forma externa
            if (listings[tokenId].isActive) {
                listings[tokenId].isActive = false;
            }
        }
        return super._update(to, tokenId, auth);
    }

    function fromOf(uint256 tokenId) internal view returns (address) {
        try this.ownerOf(tokenId) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }

    // ================================================================
    // ACTUALIZACIÓN AUTOMÁTICA DE METADATOS
    // ================================================================

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        // Si pasaron los 30 días y nunca se canjeó, expone la imagen conmemorativa 🎗️
        if (block.timestamp - nftInfo[tokenId].mintedAt >= CANJE_WINDOW_SECONDS && !nftInfo[tokenId].fueCanjeado) {
            return soulboundMetadataURI;
        }

        return nftInfo[tokenId].metadataURI;
    }

    // ================================================================
    // MERCADO SECUNDARIO P2P (Con comisión del 2%)
    // ================================================================

    function listarNFT(uint256 tokenId, uint256 precio) external soloPropietarioNFT(tokenId) nftNoCanjeado(tokenId) nftEnVentanaCanje(tokenId) {
        require(precio > 0, "El precio debe ser mayor a cero");
        
        listings[tokenId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            price: precio,
            isActive: true
        });

        emit NFTListed(tokenId, msg.sender, precio);
    }

    function comprarNFT(uint256 tokenId) external payable nonReentrant listingExists(tokenId) nftNoCanjeado(tokenId) {
        Listing memory listedItem = listings[tokenId];
        
        // Control fulminante de tiempo en el mercado P2P
        require(block.timestamp - nftInfo[tokenId].mintedAt < CANJE_WINDOW_SECONDS, "Compra denegada: El activo expiro y paso a ser Soulbound");
        require(msg.value == listedItem.price, "Monto enviado incorrecto");
        require(msg.sender != listedItem.seller, "No puedes comprar tu propio NFT");

        // Desactivar el listado antes de transferir fondos (Seguridad contra Reentrada)
        listings[tokenId].isActive = false;

        // Calcular la comisión del 2% del negocio
        uint256 fee = (listedItem.price * MARKETPLACE_FEE_PERCENT) / FEE_DENOMINATOR;
        uint256 pagoVendedor = listedItem.price - fee;

        // Acumular la comisión para el retiro del dueño de Sariel's
        accumulatedFees[owner()] += fee;

        // Transferir el 98% neto al vendedor
        (bool pagoExitoso, ) = payable(listedItem.seller).call{value: pagoVendedor}("");
        require(pagoExitoso, "Fallo al enviar pago al vendedor");

        // Ejecutar la transferencia del NFT
        _safeTransfer(listedItem.seller, msg.sender, tokenId, "");

        emit NFTSold(tokenId, listedItem.seller, msg.sender, listedItem.price, fee);
    }

    function cancelarListado(uint256 tokenId) external listingExists(tokenId) listingSeller(tokenId) {
        listings[tokenId].isActive = false;
        emit ListingCancelled(tokenId, msg.sender);
    }

    function isListed(uint256 tokenId) external view returns (bool) {
        return listings[tokenId].isActive;
    }

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        require(listings[tokenId].isActive, "El NFT no esta listado");
        return listings[tokenId];
    }

    // ================================================================
    // RETIRO DE COMISIONES (Owner)
    // ================================================================

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 monto = accumulatedFees[msg.sender];
        require(monto > 0, "No hay comisiones acumuladas para retirar");

        accumulatedFees[msg.sender] = 0;

        (bool exito, ) = payable(msg.sender).call{value: monto}("");
        require(exito, "Fallo al retirar fondos");

        emit FeesWithdrawn(msg.sender, monto);
    }

    function getAccumulatedFees() external view returns (uint256) {
        return accumulatedFees[owner()];
    }

    // ================================================================
    // ADMINISTRACIÓN
    // ================================================================

    function setAuthorizedScanner(address scanner, bool estado) external onlyOwner {
        require(scanner != address(0), "Direccion invalida");
        isAuthorizedScanner[scanner] = estado;
    }

    function setSoulboundURI(string memory nuevoURI) external onlyOwner {
        require(bytes(nuevoURI).length > 0, "URI invalida");
        soulboundMetadataURI = nuevoURI;
    }

    function setPhysicalStoreAddress(address newAddress) external onlyOwner {
        require(newAddress != address(0), "Direccion invalida");
        physicalStoreAddress = newAddress;
    }

    function convertirASoulbound(uint256 tokenId) external onlyOwner {
        NFTInfo storage nft = nftInfo[tokenId];
        require(!nft.fueCanjeado, "NFT ya fue canjeado");
        require(!nft.isSoulbound, "Ya es Soulbound");

        nft.isSoulbound = true;
        emit NFTConvertedToSoulbound(tokenId, block.timestamp);
    }

    // ================================================================
    // EMERGENCIA
    // ================================================================

    function recoverERC20(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    function recoverETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No hay ETH para recuperar");
        uint256 fees = accumulatedFees[owner()];
        uint256 recoverable = balance - fees;
        require(recoverable > 0, "Solo hay comisiones acumuladas");
        (bool sent, ) = payable(owner()).call{value: recoverable}("");
        require(sent, "Error al recuperar ETH");
    }

    // ================================================================
    // CONSULTA PARA FRONTEND
    // ================================================================

    function getNFTStatus(uint256 tokenId) external view returns (
        uint256 mintedAt,
        uint256 canjeadoEn,
        bool isSoulbound,
        bool fueCanjeado,
        string memory metadataURI,
        uint256 tiempoRestante
    ) {
        NFTInfo storage nft = nftInfo[tokenId];
        uint256 tiempoTranscurrido = block.timestamp - nft.mintedAt;
        uint256 restante = 0;

        if (!nft.fueCanjeado && !nft.isSoulbound && tiempoTranscurrido < CANJE_WINDOW_SECONDS) {
            restante = CANJE_WINDOW_SECONDS - tiempoTranscurrido;
        }

        return (
            nft.mintedAt,
            nft.canjeadoEn,
            nft.isSoulbound,
            nft.fueCanjeado,
            nft.metadataURI,
            restante
        );
    }

    function getNFTForMarketplace(uint256 tokenId) external view returns (
        address owner,
        bool isSoulbound,
        bool fueCanjeado,
        bool isListed,
        uint256 price,
        uint256 tiempoRestante
    ) {
        NFTInfo storage nft = nftInfo[tokenId];
        uint256 tiempoTranscurrido = block.timestamp - nft.mintedAt;
        uint256 restante = 0;

        if (!nft.fueCanjeado && !nft.isSoulbound && tiempoTranscurrido < CANJE_WINDOW_SECONDS) {
            restante = CANJE_WINDOW_SECONDS - tiempoTranscurrido;
        }

        return (
            ownerOf(tokenId),
            nft.isSoulbound,
            nft.fueCanjeado,
            listings[tokenId].isActive,
            listings[tokenId].price,
            restante
        );
    }

    // ================================================================
    // RECEPCIÓN DE MATIC (Requerido para el mercado P2P)
    // ================================================================

    receive() external payable {}
}