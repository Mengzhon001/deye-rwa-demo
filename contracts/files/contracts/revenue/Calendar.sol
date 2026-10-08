// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev UTC calendar arithmetic, bounded to dates used by the local demo.
library Calendar {
    function leap(uint256 y) internal pure returns(bool){return y%4==0&&(y%100!=0||y%400==0);}
    function daysIn(uint256 y,uint256 m) internal pure returns(uint256){
        if(m==2)return leap(y)?29:28;
        return m==4||m==6||m==9||m==11?30:31;
    }
    function addMonths(uint256 t,uint256 n) internal pure returns(uint256){
        uint256 days_=t/1 days;uint256 y=1970;uint256 m=1;
        require(t<7258118400&&n<=360,"calendar bound");
        while(days_>=(leap(y)?366:365)){days_-=leap(y)?366:365;y++;}
        while(days_>=daysIn(y,m)){days_-=daysIn(y,m);m++;}
        uint256 d=days_+1;uint256 next=m-1+n;y+=next/12;m=next%12+1;
        if(d>daysIn(y,m))d=daysIn(y,m);
        uint256 result=d-1;
        for(uint256 year=1970;year<y;year++)result+=leap(year)?366:365;
        for(uint256 month=1;month<m;month++)result+=daysIn(y,month);
        return result*1 days+t%1 days;
    }
}
