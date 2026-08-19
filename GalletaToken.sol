// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract GalletaToken is ERC20, Ownable, ReentrancyGuard, Pausable {
    // Constantes del negocio
    uint256 public constant PRECIO_DOMO = 75 * 10**18; // 75 MATIC en wei
    uint256 public constant TOKENS_POR_DOMO = 1 * 10**18; // 1 token por domo
    uint256 public constant TOKENS_PARA_CANJE = 12 * 10**18; // 12 tokens para canje
    
    // Mapeos para tracking
    mapping(address => uint256) public domosComprados;
    mapping(address => bool) public haCanjeado;
    mapping(address => uint256) public tokensAcumulados;
    mapping(uint256 => address) public qrTokens; // QR ID -> dirección del comprador
    mapping(address => uint256[]) public qrCodesPorUsuario;
    
    // Variables del sistema
    uint256 public totalDomosVendidos;
    uint256 public totalTokensQuemados;
    uint256 public proximoQRId = 1;
    
    // Eventos para tracking
    event DomoComprado(
        address indexed comprador, 
        uint256 cantidad, 
        uint256 tokensRecibidos,
        uint256 qrId,
        uint256 timestamp
    );
    
    event NftsCanjeado(
        address indexed usuario, 
        uint256 tokensQuemados,
        uint256 timestamp
    );
    
    event TokensQuemados(
        address indexed usuario, 
        uint256 cantidad,
        uint256 timestamp
    );
    
    event QRGenerado(
        address indexed usuario,
        uint256 qrId,
        uint256 timestamp
    );
    
    constructor() ERC20("Galleta Token", "GAL") {
        // Mint inicial para el negocio (1 millón de tokens)
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    // ============ FUNCIONES PRINCIPALES ============
    
    // Comprar domo y recibir token
    function comprarDomo() external payable nonReentrant whenNotPaused {
        require(msg.value >= PRECIO_DOMO, "Pago insuficiente");
        require(msg.value <= PRECIO_DOMO * 10, "Pago excesivo"); // Límite de 10 domos por transacción
        
        // Calcular cantidad de domos (redondeo hacia abajo)
        uint256 cantidadDomos = msg.value / PRECIO_DOMO;
        require(cantidadDomos > 0, "Cantidad minima: 1 domo");
        
        uint256 tokensRecibidos = cantidadDomos * TOKENS_POR_DOMO;
        
        // Generar QR único para cada domo
        for (uint256 i = 0; i < cantidadDomos; i++) {
            uint256 qrId = _generarQR();
            qrTokens[qrId] = msg.sender;
            qrCodesPorUsuario[msg.sender].push(qrId);
            emit QRGenerado(msg.sender, qrId, block.timestamp);
        }
        
        // Transferir tokens al comprador
        _transfer(owner(), msg.sender, tokensRecibidos);
        
        // Actualizar estadísticas
        domosComprados[msg.sender] += cantidadDomos;
        tokensAcumulados[msg.sender] += tokensRecibidos;
        totalDomosVendidos += cantidadDomos;
        
        emit DomoComprado(
            msg.sender, 
            cantidadDomos, 
            tokensRecibidos,
            proximoQRId - 1,
            block.timestamp
        );
    }
    
    // Canjear NFT (quemar 12 tokens)
    function canjearNft() external nonReentrant whenNotPaused {
        require(tokensAcumulados[msg.sender] >= TOKENS_PARA_CANJE, "No tienes suficientes tokens");
        require(!haCanjeado[msg.sender], "Ya has canjeado tu NFT");
        
        // Quemar tokens
        _burn(msg.sender, TOKENS_PARA_CANJE);
        
        // Actualizar estado
        tokensAcumulados[msg.sender] -= TOKENS_PARA_CANJE;
        haCanjeado[msg.sender] = true;
        totalTokensQuemados += TOKENS_PARA_CANJE;
        
        emit NftsCanjeado(msg.sender, TOKENS_PARA_CANJE, block.timestamp);
        emit TokensQuemados(msg.sender, TOKENS_PARA_CANJE, block.timestamp);
    }
    
    // ============ FUNCIONES DE CONSULTA ============
    
    function puedeCanjear(address usuario) external view returns (bool) {
        return tokensAcumulados[usuario] >= TOKENS_PARA_CANJE && !haCanjeado[usuario];
    }
    
    function getQRsDeUsuario(address usuario) external view returns (uint256[] memory) {
        return qrCodesPorUsuario[usuario];
    }
    
    function getProgresoCanje(address usuario) external view returns (uint256) {
        if (haCanjeado[usuario]) return 100;
        uint256 progreso = (tokensAcumulados[usuario] * 100) / TOKENS_PARA_CANJE;
        return progreso > 100 ? 100 : progreso;
    }
    
    // ============ FUNCIONES PRIVADAS ============
    
    function _generarQR() private returns (uint256) {
        uint256 qrId = proximoQRId;
        proximoQRId++;
        return qrId;
    }
    
    // ============ FUNCIONES DE ADMINISTRACIÓN ============
    
    function togglePausa() external onlyOwner {
        if (paused()) {
            _unpause();
        } else {
            _pause();
        }
    }
    
    function retirarFondos() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No hay fondos para retirar");
        payable(owner()).transfer(balance);
    }
    
    function quemarTokensAdicionales(uint256 cantidad) external {
        require(cantidad > 0, "Cantidad debe ser mayor a 0");
        require(balanceOf(msg.sender) >= cantidad, "Saldo insuficiente");
        require(cantidad <= balanceOf(msg.sender) / 2, "No puedes quemar mas de la mitad");
        
        _burn(msg.sender, cantidad);
        tokensAcumulados[msg.sender] -= cantidad;
        totalTokensQuemados += cantidad;
        
        emit TokensQuemados(msg.sender, cantidad, block.timestamp);
    }
    
    // Función para administrar el mint (solo owner)
    function mintTokens(address destino, uint256 cantidad) external onlyOwner {
        require(cantidad > 0, "Cantidad debe ser mayor a 0");
        _mint(destino, cantidad);
    }
}