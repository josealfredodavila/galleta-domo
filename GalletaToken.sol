// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract GalletaToken is ERC20, Ownable, ReentrancyGuard {
    uint256 public constant PRECIO_DOMO = 75 * 10**18; // 75 tokens
    uint256 public constant TOKENS_POR_DOMO = 1 * 10**18; // 1 token por domo
    uint256 public constant TOKENS_PARA_CANJE = 12 * 10**18; // 12 tokens para canjear
    
    mapping(address => uint256) public domosComprados;
    mapping(address => bool) public haCanjeado;
    mapping(address => uint256) public tokensAcumulados;
    mapping(uint256 => address) public qrTokens; // QR -> dirección
    
    uint256 public totalDomosVendidos;
    bool public sistemaActivo = true;
    
    event DomoComprado(address indexed comprador, uint256 cantidad, uint256 tokensRecibidos);
    event NftsCanjeado(address indexed usuario, uint256 tokensQuemados);
    event TokensQuemados(address indexed usuario, uint256 cantidad);
    
    constructor() ERC20("Galleta Token", "GAL") {
        _mint(msg.sender, 1000000 * 10**18); // Mint inicial para el negocio
    }
    
    // Función para comprar domo y recibir token
    function comprarDomo() external payable nonReentrant {
        require(sistemaActivo, "Sistema desactivado");
        require(msg.value >= PRECIO_DOMO, "Pago insuficiente");
        
        // Generar QR único para este domo
        uint256 qrId = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, totalDomosVendidos)));
        qrTokens[qrId] = msg.sender;
        
        // Transferir tokens
        _transfer(owner(), msg.sender, TOKENS_POR_DOMO);
        
        domosComprados[msg.sender]++;
        tokensAcumulados[msg.sender] += TOKENS_POR_DOMO;
        totalDomosVendidos++;
        
        emit DomoComprado(msg.sender, 1, TOKENS_POR_DOMO);
    }
    
    // Función para canjear NFT (quemar 12 tokens)
    function canjearNft() external nonReentrant {
        require(sistemaActivo, "Sistema desactivado");
        require(tokensAcumulados[msg.sender] >= TOKENS_PARA_CANJE, "No tienes suficientes tokens");
        require(!haCanjeado[msg.sender], "Ya has canjeado tu NFT");
        
        // Quemar tokens (transferir al contrato y quemar)
        _transfer(msg.sender, address(this), TOKENS_PARA_CANJE);
        _burn(address(this), TOKENS_PARA_CANJE);
        
        tokensAcumulados[msg.sender] -= TOKENS_PARA_CANJE;
        haCanjeado[msg.sender] = true;
        
        emit NftsCanjeado(msg.sender, TOKENS_PARA_CANJE);
        emit TokensQuemados(msg.sender, TOKENS_PARA_CANJE);
    }
    
    // Función para verificar si puede canjear
    function puedeCanjear(address usuario) external view returns (bool) {
        return tokensAcumulados[usuario] >= TOKENS_PARA_CANJE && !haCanjeado[usuario];
    }
    
    // Función para quemar tokens sin canjear (opcional)
    function quemarTokens(uint256 cantidad) external {
        require(cantidad > 0, "Cantidad debe ser mayor a 0");
        require(balanceOf(msg.sender) >= cantidad, "Saldo insuficiente");
        
        _burn(msg.sender, cantidad);
        emit TokensQuemados(msg.sender, cantidad);
    }
    
    // Funciones de administración
    function toggleSistema() external onlyOwner {
        sistemaActivo = !sistemaActivo;
    }
    
    function retirarFondos() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}
