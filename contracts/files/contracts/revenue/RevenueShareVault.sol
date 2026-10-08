// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDeyeRWA} from "../interfaces/IDeyeRWA.sol";
import {Calendar} from "./Calendar.sol";

/// @notice Bounded local-demo pool. No equipment control or guaranteed principal.
contract RevenueShareVault is ERC20, ERC721Holder, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 public constant MANAGER = keccak256("MANAGER");
    bytes32 public constant TRUSTEE = keccak256("TRUSTEE");
    bytes32 public constant TREASURY = keccak256("TREASURY");
    uint256 public constant COOLING = 3 days;
    uint256 public constant NOTICE = 30 days;
    uint256 public constant QUARTER = 90 days;
    uint256 public constant MAX_HOLDERS = 64;
    enum Phase { Draft, Fundraising, Active, Failed, Closed }
    Phase public phase;
    IERC20 public immutable usdc;
    IDeyeRWA public immutable stationToken;
    address public immutable feeRecipient;
    address public collectionRecipient;
    uint256 public constant termMonths=60;
    uint256 public constant lockMonths=6;
    uint256 public target;
    uint256 public deadline;
    uint256 public settledAt;
    uint256 public expiresAt;
    uint256 public totalSubscriptions;
    uint256 public acquisitionTotal;
    uint256 public operatingReserve;
    uint256 public redemptionCash;
    uint256 public unpaidDistributions;
    uint256 public feeLiability;
    uint256 public expenseLiability;
    uint256 public newReceipts;
    uint256 public lastDistributionAt;
    uint256 public lastWindowAt;
    uint256 public lastFeeAt;
    uint256 public feeBasisNAV;
    uint256 public feeMonths;
    bool public feeBasisReady;
    uint256 public monthlyMandatoryCost=1e6;
    uint256 public nextRedemptionMonth=9;
    uint256 public distributionMonths;
    uint256 public distributionCount;
    bytes32 public issuanceTerms;
    bool private moving;
    mapping(address => bool) public eligible;
    address[] public holders;
    mapping(address => bool) private registered;
    struct Subscription { uint256 amount; uint256 coolingEnd; bytes32 terms; }
    mapping(address => Subscription) public subscriptions;
    struct Right { bytes32 stationId; address owner; uint256 purchasePrice; bytes32 agreement; }
    Right[] public rights;
    mapping(bytes32 => bool) public admitted;
    mapping(bytes32 => bool) public custodyReleased;
    struct Valuation { bytes32 report; uint256 rightsPV; uint256 receivables; uint256 futureFees; uint256 asOf; uint256 validUntil; uint256 nonce; }
    Valuation public valuation;
    Valuation public proposed;
    uint256 public valuationNonce;
    bool public valuationDirty;
    struct Request { uint256 shares; uint256 requestedAt; }
    mapping(address => Request) public redemptions;
    mapping(uint256 => mapping(address => uint256)) public claimable;
    mapping(bytes32 => bool) public receiptUsed;
    mapping(bytes32 => bool) public transferApproval;
    mapping(bytes32 => bool) public transferUsed;
    mapping(bytes32 => bool) public buyerConsent;
    struct Case { bytes32 evidence; uint256 supply; uint256 support; address firstTrustee; address recipient; bool executed; }
    uint256 public caseCount;
    mapping(uint256 => Case) public cases;
    mapping(uint256 => mapping(address => uint256)) public caseWeight;
    mapping(uint256 => mapping(address => bool)) public voted;

    event StationAdmitted(bytes32 indexed stationId, bytes32 agreement, uint256 purchasePrice);
    event StationReleased(bytes32 indexed stationId,address owner);
    event EligibilityChanged(address indexed investor,bool eligible);
    event ValuationProposed(bytes32 indexed report,uint256 indexed nonce,uint256 rightsPV,uint256 receivables,uint256 futureFees,uint256 asOf,uint256 validUntil);
    event ValuationApproved(bytes32 indexed report, uint256 nonce, uint256 nav);
    event ValuationInvalidated(uint256 indexed nonce);
    event MonthlyCostConfigured(uint256 amount);
    event ProductPublished(uint256 target,uint256 deadline,bytes32 indexed terms);
    event Subscribed(address indexed investor, uint256 amount, bytes32 terms);
    event Refunded(address indexed investor, uint256 amount);
    event ProductSettled(uint256 raised, uint256 reserve, uint256 supply);
    event SettlementEvidence(bytes32 indexed evidence,bytes32 indexed issuanceTerms,bytes32 valuationReport);
    event RevenueReceived(bytes32 indexed period, bytes32 evidence, uint256 amount);
    event DistributionDeclared(uint256 indexed id, uint256 amount);
    event DistributionClaimed(uint256 indexed id, address indexed investor, uint256 amount);
    event RedemptionRequested(address indexed investor, uint256 shares);
    event RedemptionFilled(address indexed investor, uint256 shares, uint256 amount);
    event RedemptionWindowProcessed(uint256 indexed windowMonth,uint256 cutoff,uint256 price,uint256 cashLimit,uint256 requestedShares);
    event RedemptionWindowCarried(uint256 indexed windowMonth);
    event PeerTransfer(bytes32 indexed id, address indexed seller, address indexed buyer, uint256 shares, uint256 payment);
    event ServicingOpened(uint256 indexed id, bytes32 evidence);
    event CollectionChanged(uint256 indexed id, address recipient);
    event PeerTransferApproved(bytes32 indexed id);
    event TradeConsented(bytes32 indexed id,address indexed buyer,address indexed seller);
    event ServicingSupported(uint256 indexed id,address indexed holder,uint256 weight);
    event ServicingApproved(uint256 indexed id,address indexed trustee,bool executed);

    constructor(address admin, address manager, address trusteeA, address trusteeB, address treasury,
        address usdc_, address station_)
        ERC20("Deye Revenue Share", "DRS") {
        require(admin!=address(0)&&manager!=address(0)&&trusteeA!=trusteeB&&trusteeA!=address(0)&&trusteeB!=address(0)&&treasury!=address(0)&&manager!=trusteeA&&manager!=trusteeB,"invalid roles");
        usdc=IERC20(usdc_);stationToken=IDeyeRWA(station_);feeRecipient=treasury;collectionRecipient=treasury;
        _grantRole(DEFAULT_ADMIN_ROLE,admin);_grantRole(MANAGER,manager);_grantRole(TRUSTEE,trusteeA);_grantRole(TRUSTEE,trusteeB);_grantRole(TREASURY,treasury);
    }
    function decimals() public pure override returns(uint8){return 6;}
    function grantRole(bytes32 role,address account) public override {
        if(role==MANAGER)require(!hasRole(TRUSTEE,account),"separate valuation roles");
        if(role==TRUSTEE)require(!hasRole(MANAGER,account),"separate valuation roles");
        super.grantRole(role,account);
    }
    function setEligible(address who,bool value) external onlyRole(MANAGER){
        require(who!=address(0)&&who!=address(this),"invalid investor");eligible[who]=value;
        if(value&&!registered[who]){require(holders.length<MAX_HOLDERS,"holder limit");registered[who]=true;holders.push(who);}
        emit EligibilityChanged(who,value);
    }
    function holderCount() external view returns(uint256){return holders.length;}
    function rightCount() external view returns(uint256){return rights.length;}
    function economicBalance(address who) public view returns(uint256){return balanceOf(who)+redemptions[who].shares;}
    function admit(bytes32 stationId,address owner,uint256 purchasePrice,bytes32 agreement) external onlyRole(MANAGER) nonReentrant {
        require(phase==Phase.Draft&&!admitted[stationId]&&owner!=address(0)&&purchasePrice>0&&agreement!=bytes32(0),"invalid admission");
        require(rights.length<32,"station limit");
        stationToken.safeTransferFrom(owner,address(this),stationToken.facilityTokenId(stationId));
        admitted[stationId]=true;rights.push(Right(stationId,owner,purchasePrice,agreement));acquisitionTotal+=purchasePrice;
        emit StationAdmitted(stationId,agreement,purchasePrice);
    }
    function proposeValuation(bytes32 report,uint256 rightsPV,uint256 receivables,uint256 futureFees,uint256 asOf,uint256 validUntil) external onlyRole(MANAGER){
        require(report!=bytes32(0)&&asOf<=block.timestamp&&validUntil>block.timestamp&&validUntil<=asOf+32 days,"invalid valuation dates");
        require(asOf>=valuation.asOf,"older valuation");
        require(phase!=Phase.Closed&&phase!=Phase.Failed,"product ended");
        if(expiresAt>0&&block.timestamp>=expiresAt)require(rightsPV==0,"expired rights");
        proposed=Valuation(report,rightsPV,receivables,futureFees,asOf,validUntil,++valuationNonce);
        emit ValuationProposed(report,valuationNonce,rightsPV,receivables,futureFees,asOf,validUntil);
    }
    function approveValuation(uint256 nonce) external onlyRole(TRUSTEE){
        require(proposed.nonce==nonce&&nonce>valuation.nonce&&proposed.validUntil>block.timestamp,"invalid proposal");
        valuation=proposed;valuationDirty=false;
        if(phase==Phase.Active&&!feeBasisReady&&valuation.asOf>=lastFeeAt){feeBasisNAV=nav();feeBasisReady=true;}
        emit ValuationApproved(valuation.report,nonce,nav());
    }
    function invalidateValuation() external onlyRole(MANAGER){valuationDirty=true;emit ValuationInvalidated(valuation.nonce);}
    function configureMonthlyCost(uint256 value) external onlyRole(MANAGER){require(phase==Phase.Draft,"terms frozen");monthlyMandatoryCost=value;emit MonthlyCostConfigured(value);}
    function fresh() public view returns(bool){return valuation.nonce>0&&!valuationDirty&&block.timestamp<=valuation.validUntil;}
    function nav() public view returns(uint256){
        // Conditional pre-settlement custody is not an investor-owned asset yet.
        if(phase==Phase.Draft||phase==Phase.Fundraising||phase==Phase.Failed)return 0;
        uint256 assets=usdc.balanceOf(address(this))+valuation.receivables+(expiresAt>0&&block.timestamp>=expiresAt?0:valuation.rightsPV);
        uint256 debt=unpaidDistributions+feeLiability+expenseLiability+valuation.futureFees;
        return assets>debt?assets-debt:0;
    }
    function price() public view returns(uint256){return totalSupply()>0?nav()*1e6/totalSupply():1e6;}
    function publish(uint256 target_,uint256 deadline_,bytes32 terms) external onlyRole(MANAGER){
        require(phase==Phase.Draft&&rights.length>0&&fresh()&&target_>0&&deadline_>block.timestamp+COOLING&&terms!=bytes32(0),"cannot publish");
        require(target_*9000/10000>=acquisitionTotal,"target cannot fund rights");
        target=target_;deadline=deadline_;issuanceTerms=terms;phase=Phase.Fundraising;
        emit ProductPublished(target_,deadline_,terms);
    }
    function subscribe(uint256 amount,bytes32 terms) external nonReentrant{
        require(phase==Phase.Fundraising&&block.timestamp<deadline&&eligible[msg.sender]&&fresh(),"subscription unavailable");
        require(terms==issuanceTerms&&amount>0&&totalSubscriptions+amount<=target,"invalid subscription");
        Subscription storage sub=subscriptions[msg.sender];
        require(sub.amount==0,"one active subscription");
        sub.amount=amount;sub.coolingEnd=block.timestamp+COOLING;sub.terms=terms;totalSubscriptions+=amount;
        usdc.safeTransferFrom(msg.sender,address(this),amount);emit Subscribed(msg.sender,amount,terms);
    }
    function withdrawSubscription() external nonReentrant{
        Subscription storage sub=subscriptions[msg.sender];require(sub.amount>0,"no subscription");
        require((phase==Phase.Fundraising&&block.timestamp<sub.coolingEnd)||phase==Phase.Failed,"refund unavailable");
        uint256 amount=sub.amount;sub.amount=0;totalSubscriptions-=amount;usdc.safeTransfer(msg.sender,amount);emit Refunded(msg.sender,amount);
    }
    function failFundraising() external {
        require(phase==Phase.Fundraising&&(block.timestamp>=deadline||hasRole(MANAGER,msg.sender)),"cannot fail fundraising");phase=Phase.Failed;
    }
    function releaseStation(uint256 index) external nonReentrant{
        require(phase==Phase.Failed||phase==Phase.Closed,"rights still committed");
        Right memory r=rights[index];require((msg.sender==r.owner||hasRole(MANAGER,msg.sender))&&!custodyReleased[r.stationId],"release unavailable");
        custodyReleased[r.stationId]=true;stationToken.safeTransferFrom(address(this),r.owner,stationToken.facilityTokenId(r.stationId));emit StationReleased(r.stationId,r.owner);
    }
    function settle(bytes32 evidence) external onlyRole(MANAGER) nonReentrant{
        require(evidence!=bytes32(0),"settlement evidence required");
        require(phase==Phase.Fundraising&&block.timestamp<deadline&&fresh(),"cannot settle");
        require(totalSubscriptions*10000>=target*7000&&totalSubscriptions*9000/10000>=acquisitionTotal,"insufficient confirmed funding");
        for(uint256 i=0;i<holders.length;i++){
            Subscription memory sub=subscriptions[holders[i]];
            if(sub.amount>0)require(block.timestamp>=sub.coolingEnd&&eligible[holders[i]]&&sub.terms==issuanceTerms,"unconfirmed order");
        }
        phase=Phase.Active;settledAt=block.timestamp;expiresAt=Calendar.addMonths(block.timestamp,60);
        lastDistributionAt=block.timestamp;lastWindowAt=block.timestamp;lastFeeAt=block.timestamp;
        for(uint256 i=0;i<holders.length;i++)if(subscriptions[holders[i]].amount>0)_mint(holders[i],subscriptions[holders[i]].amount);
        for(uint256 i=0;i<rights.length;i++)usdc.safeTransfer(rights[i].owner,rights[i].purchasePrice);
        operatingReserve=usdc.balanceOf(address(this));feeBasisNAV=nav();feeBasisReady=false;valuationDirty=true;
        emit ProductSettled(totalSubscriptions,operatingReserve,totalSupply());
        emit SettlementEvidence(evidence,issuanceTerms,valuation.report);
    }
    function receiveRevenue(bytes32 period,uint256 amount,bytes32 evidence) external onlyRole(TREASURY) nonReentrant{
        require(phase==Phase.Active&&!receiptUsed[period]&&amount>0&&evidence!=bytes32(0),"invalid receipt");
        receiptUsed[period]=true;newReceipts+=amount;valuationDirty=true;
        usdc.safeTransferFrom(msg.sender,address(this),amount);emit RevenueReceived(period,evidence,amount);
    }
    function nextFeeAt() public view returns(uint256){return settledAt==0?0:Calendar.addMonths(settledAt,feeMonths+1);}
    function unlockedAt() public view returns(uint256){return settledAt==0?0:Calendar.addMonths(settledAt,6);}
    function nextDistributionAt() public view returns(uint256){return settledAt==0?0:Calendar.addMonths(settledAt,distributionMonths+3);}
    /// @dev Each calendar month requires an approved opening NAV; skipped approvals cannot be invented.
    function accrueFees() public {
        require(phase==Phase.Active,"not active");
        uint256 end=nextFeeAt();
        require(end<=expiresAt&&block.timestamp>=end&&feeBasisReady,"monthly approval required");
        feeLiability+=feeBasisNAV*50/120000;expenseLiability+=monthlyMandatoryCost;lastFeeAt=end;feeMonths++;feeBasisReady=false;valuationDirty=true;
    }
    function distribute(uint256 reserveTarget,uint256 mandatoryCost,bytes32 evidence) external onlyRole(MANAGER) nonReentrant{
        require(phase==Phase.Active&&distributionMonths<60&&block.timestamp>=nextDistributionAt()&&fresh()&&evidence!=bytes32(0),"distribution unavailable");
        require(nextFeeAt()>block.timestamp||feeMonths==60,"accrue monthly fees first");
        require(reserveTarget==monthlyMandatoryCost*6&&mandatoryCost==monthlyMandatoryCost*3,"expense policy mismatch");
        require(expenseLiability>=mandatoryCost,"accrue mandatory expenses first");
        uint256 free=usdc.balanceOf(address(this))-unpaidDistributions;
        uint256 costs=mandatoryCost+feeLiability;require(free>=costs,"unfunded expenses");
        if(costs>0)usdc.safeTransfer(feeRecipient,costs);feeLiability=0;expenseLiability-=mandatoryCost;free-=costs;
        uint256 protectedCash=reserveTarget+expenseLiability;
        operatingReserve=protectedCash<free?protectedCash:free;
        if(redemptionCash>free-operatingReserve)redemptionCash=free-operatingReserve;
        uint256 surplus=free-operatingReserve-redemptionCash;
        uint256 netReceipts=newReceipts>costs?newReceipts-costs:0;
        if(surplus>netReceipts)surplus=netReceipts;
        operatingReserve=free-redemptionCash-surplus;
        uint256 payout=surplus*7500/10000;redemptionCash+=surplus-payout;newReceipts=0;lastDistributionAt=block.timestamp;distributionMonths+=3;
        _declare(payout);valuationDirty=true;
    }
    function _declare(uint256 payout) private {
        uint256 id=++distributionCount;uint256 assigned;address roundingRecipient;
        for(uint256 i=0;i<holders.length;i++){
            uint256 weight=economicBalance(holders[i]);if(weight>0&&roundingRecipient==address(0))roundingRecipient=holders[i];
            uint256 entitlement=totalSupply()>0?payout*weight/totalSupply():0;
            claimable[id][holders[i]]=entitlement;assigned+=entitlement;
        }
        // Allocate sub-cent integer dust deterministically, including the final wind-down.
        if(roundingRecipient!=address(0)&&assigned<payout){claimable[id][roundingRecipient]+=payout-assigned;assigned=payout;}
        unpaidDistributions+=assigned;operatingReserve+=payout-assigned;
        emit DistributionDeclared(id,assigned);
    }
    function claim(uint256 id) external nonReentrant{
        uint256 value=claimable[id][msg.sender];require(value>0,"nothing to claim");claimable[id][msg.sender]=0;unpaidDistributions-=value;
        usdc.safeTransfer(msg.sender,value);emit DistributionClaimed(id,msg.sender,value);
    }
    function requestRedemption(uint256 shares) external nonReentrant{
        require(phase==Phase.Active&&block.timestamp>=unlockedAt()&&block.timestamp<expiresAt&&eligible[msg.sender],"redemption locked");
        require(shares>0&&redemptions[msg.sender].shares==0,"invalid request");
        require(block.timestamp<redemptionCutoff(),"window cutoff passed");
        redemptions[msg.sender]=Request(shares,block.timestamp);_move(msg.sender,address(this),shares);emit RedemptionRequested(msg.sender,shares);
    }
    function cancelRedemption() external nonReentrant{
        Request memory r=redemptions[msg.sender];require(r.shares>0,"no request");
        require(block.timestamp<redemptionCutoff()||phase==Phase.Closed,"cutoff passed");
        delete redemptions[msg.sender];_move(address(this),msg.sender,r.shares);
    }
    function redemptionDate() public view returns(uint256){return settledAt==0?0:Calendar.addMonths(settledAt,nextRedemptionMonth);}
    function redemptionCutoff() public view returns(uint256){return settledAt==0?0:redemptionDate()-NOTICE;}
    function carryMissedWindow() external onlyRole(MANAGER){
        require(phase==Phase.Active&&block.timestamp>redemptionDate()+7 days,"window not missed");
        emit RedemptionWindowCarried(nextRedemptionMonth);nextRedemptionMonth+=3;
    }
    function processRedemptions() external onlyRole(MANAGER) nonReentrant{
        require(phase==Phase.Active&&block.timestamp>=redemptionDate()&&block.timestamp<=redemptionDate()+7 days&&fresh(),"window unavailable");
        require(block.timestamp>=unlockedAt(),"redemption locked");
        require(valuation.asOf/1 days==block.timestamp/1 days,"dealing-date valuation required");
        uint256 unitPrice=price();require(unitPrice>0,"zero NAV");uint256 demand;
        for(uint256 i=0;i<holders.length;i++)if(eligible[holders[i]]&&block.timestamp>=redemptions[holders[i]].requestedAt+NOTICE)demand+=redemptions[holders[i]].shares;
        require(demand>0,"no mature requests");
        uint256 cap=nav()*500/10000;if(cap>redemptionCash)cap=redemptionCash;
        uint256 balance=usdc.balanceOf(address(this));uint256 protectedCash=unpaidDistributions+feeLiability+expenseLiability+monthlyMandatoryCost*6;
        uint256 available=balance>protectedCash?balance-protectedCash:0;if(cap>available)cap=available;
        uint256 fillShares=cap*1e6/unitPrice;if(fillShares>demand)fillShares=demand;
        emit RedemptionWindowProcessed(nextRedemptionMonth,redemptionCutoff(),unitPrice,cap,demand);
        lastWindowAt=block.timestamp;nextRedemptionMonth+=3;
        for(uint256 i=0;i<holders.length;i++){
            address who=holders[i];Request storage r=redemptions[who];
            if(!eligible[who]||r.shares==0||block.timestamp<r.requestedAt+NOTICE)continue;
            uint256 fill=r.shares*fillShares/demand;uint256 payment=fill*unitPrice/1e6;
            if(fill>0&&payment>0){r.shares-=fill;_burn(address(this),fill);redemptionCash-=payment;usdc.safeTransfer(who,payment);emit RedemptionFilled(who,fill,payment);}
            r.requestedAt=block.timestamp;
        }
    }
    function transferId(address seller,address buyer,uint256 shares,uint256 payment,uint256 until,uint256 nonce) public view returns(bytes32){
        return keccak256(abi.encode(block.chainid,address(this),seller,buyer,shares,payment,until,nonce));
    }
    function approvePeerTransfer(bytes32 id) external onlyRole(MANAGER){transferApproval[id]=true;emit PeerTransferApproved(id);}
    function consentToTrade(address seller,uint256 shares,uint256 payment,uint256 until,uint256 nonce) external {
        require(eligible[msg.sender]&&seller!=msg.sender&&until>=block.timestamp,"invalid consent");
        bytes32 id=transferId(seller,msg.sender,shares,payment,until,nonce);buyerConsent[id]=true;emit TradeConsented(id,msg.sender,seller);
    }
    /// @notice Seller authorizes exact terms; buyer independently approves exact USDC allowance to this vault.
    function peerTransfer(address buyer,uint256 shares,uint256 payment,uint256 until,uint256 nonce) external nonReentrant{
        require(phase==Phase.Active&&block.timestamp>=unlockedAt()&&block.timestamp<expiresAt&&fresh(),"transfer locked");
        require(buyer!=msg.sender&&eligible[msg.sender]&&eligible[buyer]&&shares>0&&payment>0&&block.timestamp<=until,"invalid trade");
        bytes32 id=transferId(msg.sender,buyer,shares,payment,until,nonce);require(!transferUsed[id]&&buyerConsent[id],"trade not authorized");
        uint256 referenceValue=shares*price()/1e6;
        uint256 deviation=payment>referenceValue?payment-referenceValue:referenceValue-payment;
        require(referenceValue>0&&(deviation*100<=referenceValue*10||transferApproval[id]),"review required");
        transferUsed[id]=true;usdc.safeTransferFrom(buyer,msg.sender,payment);
        _move(msg.sender,buyer,shares);emit PeerTransfer(id,msg.sender,buyer,shares,payment);
    }
    function openCase(bytes32 evidence,address recipient) external onlyRole(MANAGER) returns(uint256 id){
        require(phase==Phase.Active&&evidence!=bytes32(0)&&recipient!=address(0),"invalid case");
        id=++caseCount;cases[id]=Case(evidence,totalSupply(),0,address(0),recipient,false);
        for(uint256 i=0;i<holders.length;i++)caseWeight[id][holders[i]]=economicBalance(holders[i]);emit ServicingOpened(id,evidence);
    }
    function supportCase(uint256 id) external{
        Case storage c=cases[id];require(c.supply>0&&!c.executed&&!voted[id][msg.sender]&&caseWeight[id][msg.sender]>0,"invalid vote");
        voted[id][msg.sender]=true;c.support+=caseWeight[id][msg.sender];emit ServicingSupported(id,msg.sender,caseWeight[id][msg.sender]);
    }
    function approveCase(uint256 id) external onlyRole(TRUSTEE){
        Case storage c=cases[id];require(c.supply>0&&!c.executed&&c.support*100>=c.supply*30,"threshold not met");
        if(c.firstTrustee==address(0)){c.firstTrustee=msg.sender;emit ServicingApproved(id,msg.sender,false);return;}
        require(c.firstTrustee!=msg.sender,"distinct trustee required");c.executed=true;collectionRecipient=c.recipient;emit ServicingApproved(id,msg.sender,true);emit CollectionChanged(id,c.recipient);
    }
    function closeProduct() external onlyRole(MANAGER) nonReentrant{
        require(phase==Phase.Active&&block.timestamp>=expiresAt&&fresh()&&valuation.receivables==0&&valuation.rightsPV==0&&valuation.futureFees==0&&feeLiability==0&&expenseLiability==0&&feeMonths==60&&distributionMonths==60,"cannot close");
        uint256 free=usdc.balanceOf(address(this))-unpaidDistributions;redemptionCash=0;operatingReserve=0;_declare(free);phase=Phase.Closed;
    }
    function _move(address from,address to,uint256 value) private{moving=true;_transfer(from,to,value);moving=false;}
    function _update(address from,address to,uint256 value) internal override{
        require(from==address(0)||to==address(0)||moving,"restricted transfer");super._update(from,to,value);
    }
}
